#!/usr/bin/env bun
/**
 * gh-reply-queue.ts
 *
 * Cron job (every 5 min, 08:00–22:00 CST Mon–Fri) that:
 *   1. Scans the issues endpoint of `AndlerRL/*` repos for AndlerRL comments
 *      that are not AndlerRL-initiated (i.e., Andler replied to a thread we
 *      started, OR Andler tagged @wobblus in a new comment).
 *   2. Posts a Wobblus reply on the same thread + a reaction per the
 *      HEARTBEAT.md "reaction map" (👀 ack / ✅ fixed / 🚧 in-progress /
 *      🎉 closed / 💡 FYI / 🚨 conflict).
 *   3. Logs the reply queue to `/tmp/gh-reply-queue-debug.log` (silent path)
 *      and to stdout (real work path → OpenClaw cron announce → #annotations).
 *
 * Protocol: HEARTBEAT.md "PR-comment-process note" (locked 2026-07-08 05:43 CST).
 * Pattern: lesson 53 silent-on-idle (per-tick debug to file, real work to stdout).
 *
 * Trigger filter (lesson 48 + Andler-direct 2026-07-08 20:47 CST):
 *   - author.login == "AndlerRL"  (only you, no fork contributors, no bots)
 *   - state in { OPEN, CLOSED, MERGED, DRAFT }  (option B: act on all states)
 *   - AND one of:
 *       (a) comment mentions @wobblus (case-insensitive)
 *       (b) comment is a reply (in_reply_to_id) to a Wobblus comment
 *       (c) comment body starts with "@wobblus" or "Wobblus:"
 *
 * Access control (Andler-direct 2026-07-08 20:47 CST):
 *   - gh CLI authenticated as `wobblus` (bot), not `AndlerRL`
 *   - Even if a fork contributor tags @wobblus, Wobblus does NOT act
 *   - gh reply posts as the bot (wobblus) — never impersonates AndlerRL
 *
 * Usage:
 *   bun run scripts/gh-reply-queue.ts
 *
 * Environment:
 *   GH_REPLY_QUEUE_QUIET_IDLE=0   Disable silent-on-idle (verbose debugging)
 *   GH_REPLY_QUEUE_DRY_RUN=1      Compute reply queue, do not post
 *   GH_REPLY_QUEUE_REPOS=...      Comma-separated repos to scan (default: AndlerRL/andler-landing,AndlerRL/andler-chatbot-spike)
 *
 * Exit codes:
 *   0 = success (silent tick OR real work)
 *   1 = validation failure (missing gh auth, bad config)
 *   2 = infrastructure failure (gh API down, rate limit)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

// ============================================================
// CONFIG
// ============================================================

const QUIET_IDLE = process.env.GH_REPLY_QUEUE_QUIET_IDLE !== "0"; // default on
const DRY_RUN = process.env.GH_REPLY_QUEUE_DRY_RUN === "1";
const DEBUG_LOG = "/tmp/gh-reply-queue-debug.log";
const LAST_ACTIVITY_FILE = "/tmp/gh-reply-queue-last-activity";
const REPLY_STATE_FILE = "/tmp/gh-reply-queue-state.json";

const DEFAULT_REPOS = "AndlerRL/andler-landing,AndlerRL/andler-chatbot-spike";
const REPOS = (process.env.GH_REPLY_QUEUE_REPOS ?? DEFAULT_REPOS)
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);

const ANDLER_LOGIN = "AndlerRL";
const WOBBLUS_LOGIN = "wobblus";

const PER_PAGE = 20; // last 20 comments per issue/PR (covers ~1 day of activity on small repos)
const REACTION_MAP: Record<string, { emoji: string; reason: string }> = {
  ack: { emoji: "👀", reason: "Acknowledged — will action" },
  in_progress: { emoji: "🚧", reason: "Working on it" },
  fixed: { emoji: "✅", reason: "Fixed and verified" },
  conflict: { emoji: "🚨", reason: "Conflict / blocker — needs your input" },
  question: { emoji: "❓", reason: "Question — need clarification" },
  fyi: { emoji: "💡", reason: "FYI / informational" },
  closed: { emoji: "🎉", reason: "Resolved / merged / closed" },
  reverted: { emoji: "↩️", reason: "Reverted" },
  salute: { emoji: "🫡", reason: "Review requested" },
};

// ============================================================
// LOGGING (lesson 53 silent-on-idle pattern)
// ============================================================

function ts(): string {
  return new Date().toISOString();
}

function log(message: string): void {
  writeFileSync(LAST_ACTIVITY_FILE, ts());
  const line = `[${ts()}] ${message}\n`;
  if (QUIET_IDLE) {
    appendFileSync(DEBUG_LOG, line);
  } else {
    process.stdout.write(line);
  }
}

function logWork(message: string): void {
  writeFileSync(LAST_ACTIVITY_FILE, ts());
  // Real work → stdout → OpenClaw cron announce → #annotations
  process.stdout.write(`[${ts()}] ${message}\n`);
}

// ============================================================
// GH API HELPERS
// ============================================================

function gh(args: string): string {
  try {
    return execSync(`gh ${args}`, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err: any) {
    const stderr = err.stderr?.toString() ?? "";
    log(`gh ${args.split(" ")[0]} failed: ${stderr.split("\n")[0]}`);
    throw err;
  }
}

interface GhComment {
  id: number;
  body: string;
  user: { login: string };
  created_at: string;
  in_reply_to_id?: number;
  // PR comments have these; issue comments don't
  pull_request_review_id?: number;
  // For PR comments via the issues endpoint, the URL distinguishes
  html_url: string;
}

interface GhIssue {
  number: number;
  state: string; // "open" | "closed" (PRs use "open" | "closed" + pull_request.merged_at)
  title: string;
  comments: number;
  // PR discriminator: pull_request is null for issues, object for PRs
  pull_request: { url: string } | null;
  // Author of the issue/PR opener (for context)
  user: { login: string };
}

function fetchOpenIssuesAndPRs(repo: string): GhIssue[] {
  // Use gh api directly — `gh issue list --json` doesn't expose `pull_request`
  // or `user` on this version (field is `author`, and PR discriminator missing).
  // The issues endpoint returns BOTH issues and PRs (PRs are issues under the hood).
  // Per option B, scan all states: state=all returns open + closed (PRs add merged).
  // We rely on pull_request field to discriminate (null = issue, object = PR).
  const json = gh(
    `api "repos/${repo}/issues?state=all&per_page=50"`,
  );
  return JSON.parse(json) as GhIssue[];
}

function fetchRecentComments(repo: string, issueNumber: number): GhComment[] {
  // Issue-level comments (covers both issues and PR conversation comments).
  const json = gh(
    `api repos/${repo}/issues/${issueNumber}/comments?per_page=${PER_PAGE}`,
  );
  return JSON.parse(json) as GhComment[];
}

function fetchRecentPRReviewComments(repo: string, prNumber: number): GhComment[] {
  // PR inline review comments live at /pulls/{n}/comments (NOT /issues/{n}/comments).
  // These are comments on specific diff lines (inline code review).
  const json = gh(
    `api repos/${repo}/pulls/${prNumber}/comments?per_page=${PER_PAGE}`,
  );
  return JSON.parse(json) as GhComment[];
}

function fetchAndlerInitiation(repo: string, sinceIso: string): { issueNumber: number; andlerCommentIds: number[] }[] {
  // For each open OR recently-active issue/PR, fetch its AndlerRL comments
  // since the last activity timestamp. Filter: author.login == "AndlerRL"
  // AND (mentions @wobblus OR is a reply to a Wobblus comment).
  // For PRs, also fetch inline review comments via /pulls/{n}/comments.
  const issues = fetchOpenIssuesAndPRs(repo);
  const result: { issueNumber: number; andlerCommentIds: number[] }[] = [];
  for (const issue of issues) {
    try {
      const comments = fetchRecentComments(repo, issue.number);
      // If this is a PR, also fetch inline review comments (Bug 1 fix).
      // PR inline review comments live at /pulls/{n}/comments, a separate endpoint.
      const allComments = issue.pull_request
        ? [...comments, ...fetchRecentPRReviewComments(repo, issue.number)]
        : comments;
      const andlerComments = allComments.filter(
        (c) =>
          c.user.login === ANDLER_LOGIN &&
          c.created_at >= sinceIso &&
          (isWobblusMention(c.body) || isReplyToWobblus(c, allComments)),
      );
      if (andlerComments.length > 0) {
        result.push({
          issueNumber: issue.number,
          andlerCommentIds: andlerComments.map((c) => c.id),
        });
      }
    } catch (err: any) {
      log(`fetch comments for ${repo}#${issue.number} failed: ${err.message ?? err}`);
    }
  }
  return result;
}

function isWobblusMention(body: string): boolean {
  // Match: @wobblus (canonical), Wobblus: (greeting), "Wobblus —" (dash form), "Wobblus,", "Wobblus 🔧"
  return /@wobblus\b/i.test(body) || /\bwobblus\b/i.test(body);
}

function isReplyToWobblus(comment: GhComment, allComments: GhComment[]): boolean {
  if (!comment.in_reply_to_id) return false;
  return allComments.some(
    (c) => c.id === comment.in_reply_to_id && c.user.login === WOBBLUS_LOGIN,
  );
}

// ============================================================
// REPLY POSTING
// ============================================================

interface ReplyAction {
  repo: string;
  issueNumber: number;
  commentId: number;
  body: string;
  reaction: { emoji: string; reason: string };
  andlerBody: string; // The AndlerRL comment body, for context in composeReply
}

function postReply(action: ReplyAction): void {
  if (DRY_RUN) {
    logWork(
      `[DRY-RUN] would reply on ${action.repo}#${action.issueNumber} comment ${action.commentId} with reaction ${action.reaction.emoji} (${action.reaction.reason})`,
    );
    return;
  }
  // 1. Post the reply on the same thread. The /issues/{n}/comments endpoint
  // covers BOTH issue comments AND PR-conversation comments (PRs are issues
  // under the hood). For PR review thread replies (inline code review on a
  // diff line), use /pulls/{n}/comments with `in_reply_to` instead — out of
  // scope for v1, we focus on issue-level + PR-conversation comments.
  // Note: GH REST API does not support nested threading on issue/PR-conversation
  // comments (`in_reply_to_id` is silently dropped on POST). For PR review thread
  // replies (inline code review on a diff line), use /pulls/{n}/comments with
  // `in_reply_to` instead — out of scope for v1, we focus on issue-level +
  // PR-conversation comments. The body still references the AndlerRL comment URL
  // so the human reader can find it.
  const replyJson = gh(
    `api repos/${action.repo}/issues/${action.issueNumber}/comments ` +
      `-f body=${JSON.stringify(action.body)} ` +
      `-X POST`,
  );
  const reply = JSON.parse(replyJson) as { id: number; html_url: string };
  // 2. React to the AndlerRL comment with the matching reaction.
  // Reaction API: /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions
  // Body: { content: <reaction_name> }
  // Reaction name is the gh API enum (eyes, hooray, etc.), not the emoji.
  gh(
    `api repos/${action.repo}/issues/comments/${action.commentId}/reactions ` +
      `-f content=${JSON.stringify(reactionToName(action.reaction.emoji))} ` +
      `-X POST`,
  );
  logWork(
    `Replied to ${action.repo}#${action.issueNumber} (AndlerRL comment ${action.commentId} → Wobblus comment ${reply.id}). Reaction: ${action.reaction.emoji} ${action.reaction.reason}`,
  );
  logWork(`  URL: ${reply.html_url}`);
}

function reactionToName(emoji: string): string {
  // Map our short emoji to gh API's reaction content names.
  // GH REST API only accepts: +1, -1, laugh, confused, heart, hooray, rocket, eyes.
  // (Bug 2 fix: previous map returned invalid names like "construction",
  // "bulb", "tada", "rewind", "salute" → HTTP 422.)
  const map: Record<string, string> = {
    "👀": "eyes",       // ack
    "✅": "+1",        // fixed (was "hooray", but +1 is closer to "approved/fixed")
    "🚧": "rocket",    // in-progress (rocket = working/launched)
    "🚨": "confused",  // conflict/blocker (alert needs attention)
    "❓": "confused",   // question (genuine question, not answered)
    "💡": "eyes",       // FYI/informational (eyes = noted/seen)
    "🎉": "hooray",    // closed/resolved (celebration)
    "↩️": "-1",        // reverted (negative/undo)
    "🫡": "+1",        // salute/review requested (acknowledged)
    "❤️": "heart",     // heart
    "👍🏼": "+1",        // thumbs up
  };
  return map[emoji] ?? "eyes";
}

function composeReply(action: ReplyAction, context: { state: string; title: string; andlerBody: string }): string {
  // A short, professional Wobblus reply that:
  //  - acknowledges the AndlerRL message
  //  - references the reaction
  //  - surfaces what I understood the ask to be
  //  - links to the AndlerRL comment for clickable context
  // Keeps the reply on the same PR/issue conversation per HEARTBEAT.md.
  // Note: GH REST API doesn't support nested replies on issue/PR-conversation
  // comments (only on PR review comments via /pulls/{n}/comments). So we
  // top-level-reply + reference the AndlerRL comment URL in the body. Future
  // v2 can use GraphQL createPullRequestReviewThread for true threading.
  const andlerUrl = `https://github.com/${action.repo}/issues/${action.issueNumber}#issuecomment-${action.commentId}`;
  const understanding = inferUnderstanding(context.andlerBody, action.reaction);
  return [
    `${action.reaction.emoji} **Acknowledged.** ${action.reaction.reason}.`,
    ``,
    understanding,
    ``,
    `Reference: \`${action.repo}#${action.issueNumber}\` (${context.state.toUpperCase()}: ${context.title.slice(0, 80)}) — [AndlerRL comment](${andlerUrl})`,
    ``,
    `— Wobblus 🔧 (gh-reply-queue cron, post-and-react pattern per HEARTBEAT.md)`,
  ].join("\n");
}

function inferUnderstanding(body: string, reaction: { emoji: string; reason: string }): string {
  // Surface what I understood the ask to be, derived from the AndlerRL body.
  // This is pattern-matching, not magic — for unknown cases we fall back to
  // a generic "will action this in the next team tick" line.
  const lower = body.toLowerCase();
  if (/\bvercel\b.*\b(deploy|build|schema)/.test(lower) || /\bstartcommand\b/.test(lower)) {
    return `Heard: Vercel deploy error (likely \`vercel.json\` schema or build issue). Will trace the deploy log + \`vercel.json\` schema, surface the fix in the next tick.`;
  }
  if (/\baccess\b|\bpush\b|\bbranch\b|\bpr\b/.test(lower)) {
    return `Heard: repo access / push / branch / PR instruction. Will verify gh auth + remote state in the next tick.`;
  }
  if (/\bblocker\b|\bconflict\b|\bstuck\b/.test(lower)) {
    return `Heard: blocker / conflict / stuck on your end. Will surface the unblock path in the next tick.`;
  }
  if (/\bmerge\b|\bship\b|\bapprove\b/.test(lower)) {
    return `Heard: ship / merge / approval signal. Will action in the next tick.`;
  }
  return `Will action this in the next team tick.`;
}

// ============================================================
// STATE PERSISTENCE (avoid double-replying on the same Andler comment)
// ============================================================

interface ReplyState {
  lastRunIso: string;
  repliedCommentIds: number[]; // (repo, commentId) tuples deduped by id
  seenRepos: string[];
}

function loadState(): ReplyState {
  if (existsSync(REPLY_STATE_FILE)) {
    try {
      return JSON.parse(readFileSync(REPLY_STATE_FILE, "utf-8"));
    } catch {
      log(`could not parse ${REPLY_STATE_FILE}, starting fresh`);
    }
  }
  return { lastRunIso: "1970-01-01T00:00:00Z", repliedCommentIds: [], seenRepos: REPOS };
}

function saveState(state: ReplyState): void {
  writeFileSync(REPLY_STATE_FILE, JSON.stringify(state, null, 2));
}

function alreadyReplied(state: ReplyState, commentId: number): boolean {
  return state.repliedCommentIds.includes(commentId);
}

function markReplied(state: ReplyState, commentId: number): void {
  if (!state.repliedCommentIds.includes(commentId)) {
    state.repliedCommentIds.push(commentId);
  }
  // Cap the dedup list at 500 entries to prevent unbounded growth
  if (state.repliedCommentIds.length > 500) {
    state.repliedCommentIds = state.repliedCommentIds.slice(-500);
  }
}

// ============================================================
// MAIN
// ============================================================

function main(): number {
  // 1. Validate gh auth — use --active --hostname github.com (the --json output
  // is only "hosts" as a structured field, so we parse the human-readable line).
  try {
    const authJson = gh("auth status --active --hostname github.com");
    if (!new RegExp(`account ${WOBBLUS_LOGIN}\\b`, "i").test(authJson)) {
      const acctLine = authJson.split("\n").find((l) => /account/i.test(l)) ?? "unknown";
      logWork(`❌ gh auth active account is not "${WOBBLUS_LOGIN}" — got: ${acctLine}`);
      return 1;
    }
  } catch (err: any) {
    logWork(`❌ gh auth check failed: ${err.message ?? err}`);
    return 1;
  }
  log(`gh auth OK (active=${WOBBLUS_LOGIN})`);

  // 2. Load state
  const state = loadState();
  const sinceIso = state.lastRunIso;
  log(`scanning ${REPOS.length} repos for AndlerRL comments since ${sinceIso}`);

  // 3. Scan each repo
  let totalActions = 0;
  const newActions: ReplyAction[] = [];
  for (const repo of REPOS) {
    try {
      const initiation = fetchAndlerInitiation(repo, sinceIso);
      for (const { issueNumber, andlerCommentIds } of initiation) {
        // Fetch comments once per issue (for the andlerBody context).
        // For PRs, also fetch inline review comments (Bug 1 fix).
        const issueData = fetchOpenIssuesAndPRs(repo).find((i) => i.number === issueNumber);
        const comments = issueData?.pull_request
          ? [...fetchRecentComments(repo, issueNumber), ...fetchRecentPRReviewComments(repo, issueNumber)]
          : fetchRecentComments(repo, issueNumber);
        for (const commentId of andlerCommentIds) {
          if (alreadyReplied(state, commentId)) {
            log(`  skip ${repo}#${issueNumber} comment ${commentId} (already replied)`);
            continue;
          }
          const andlerComment = comments.find((c) => c.id === commentId);
          if (!andlerComment) continue;
          const reaction = chooseReaction(andlerComment.body);
          newActions.push({
            repo,
            issueNumber,
            commentId,
            body: "", // composed below after we have the issue context
            reaction,
            andlerBody: andlerComment.body,
          });
        }
      }
    } catch (err: any) {
      log(`scan ${repo} failed: ${err.message ?? err}`);
    }
  }

  if (newActions.length === 0) {
    log("no new AndlerRL actions to take");
    state.lastRunIso = ts();
    saveState(state);
    return 0;
  }

  // 4. For each action, fetch issue/PR context, compose reply, post
  for (const action of newActions) {
    try {
      const issueJson = gh(
        `api repos/${action.repo}/issues/${action.issueNumber} --jq '{state: .state, title: .title}'`,
      );
      const issueCtx = JSON.parse(issueJson) as { state: string; title: string };
      action.body = composeReply(action, { ...issueCtx, andlerBody: action.andlerBody });
      postReply(action);
      markReplied(state, action.commentId);
      totalActions++;
    } catch (err: any) {
      log(`post reply for ${action.repo}#${action.issueNumber} comment ${action.commentId} failed: ${err.message ?? err}`);
    }
  }

  // 5. Save state
  state.lastRunIso = ts();
  saveState(state);

  if (totalActions > 0) {
    logWork(`✅ gh-reply-queue: posted ${totalActions} replies on AndlerRL threads`);
  }
  return 0;
}

function chooseReaction(body: string): { emoji: string; reason: string } {
  const lower = body.toLowerCase();
  if (/\b(blocker|conflict|stuck|urgent|emergency|🚨)\b/.test(lower)) return REACTION_MAP.conflict!;
  if (/\?$/.test(lower.trim()) || /\bquestion\b/.test(lower)) return REACTION_MAP.question!;
  if (/\b(merged|closed|done|resolved|shipped|🎉)\b/.test(lower)) return REACTION_MAP.closed!;
  if (/\b(revert|rollback|undo|↩️)\b/.test(lower)) return REACTION_MAP.reverted!;
  if (/\b(wip|in progress|in-progress|working on|🚧)\b/.test(lower)) return REACTION_MAP.in_progress!;
  if (/\b(fyi|note:|info:|💡|informational)\b/.test(lower)) return REACTION_MAP.fyi!;
  if (/\b(review|@chanshuk|@nikaya|@gimblich|@keridz|@talanara|@hugrukal|🫡)\b/.test(lower))
    return REACTION_MAP.salute!;
  // Default: acknowledge
  return REACTION_MAP.ack!;
}

const exitCode = main();
process.exit(exitCode);
