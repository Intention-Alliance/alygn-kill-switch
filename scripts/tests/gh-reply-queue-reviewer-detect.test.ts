// Standalone test of reviewer-feedback detection logic (mirrors gh-reply-queue.ts)
const REVIEWER_LOGINS = ["chanshuk", "nikaya", "gimblich", "keridz", "talanara", "hugrukal"];
const REVIEWER_BOT_PATTERNS = [/coderabbit/i, /code.?rabbit/i];
const EXCLUDED_BOT_PATTERNS = [/vercel/i, /dependabot/i, /renovate/i, /github-actions/i, /github\s*bot/i];
const ACTION_PATTERN = /(NOTE-\d+|FAIL|PASS|action item|action-item|must fix|should fix|blocking|required change)/i;

function isExcludedBot(body: string, author: string): boolean {
  const lower = body.toLowerCase();
  if (EXCLUDED_BOT_PATTERNS.some((p) => p.test(lower))) return true;
  if (author === "wobblus") return true;
  return false;
}

function isReviewerOrBot(author: string, body: string): boolean {
  const lowerAuthor = author.toLowerCase();
  if (REVIEWER_LOGINS.includes(lowerAuthor)) return true;
  if (REVIEWER_BOT_PATTERNS.some((p) => p.test(body))) return true;
  return false;
}

function extractActionPatterns(body: string): string[] {
  const patterns: string[] = [];
  const noteMatches = body.match(/NOTE-\d+/gi);
  if (noteMatches) patterns.push(...noteMatches.map((m) => m.toUpperCase()));
  if (/\bFAIL\b/i.test(body)) patterns.push("FAIL");
  if (/\bPASS\b/i.test(body)) patterns.push("PASS");
  if (/action item|action-item|must fix|should fix|blocking|required change/i.test(body)) {
    patterns.push("ACTION-ITEM");
  }
  return patterns;
}

let pass = 0, fail = 0;
function check(name: string, got: boolean | string[], want: boolean | string[]) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`✅ ${name}`); }
  else { fail++; console.log(`❌ ${name}: got ${g} want ${w}`); }
}

check("T1 reviewer login chanshuk", isReviewerOrBot("chanshuk", "Stage 1 review: NOTE-1 needs fix"), true);
check("T2 coderabbit bot", isReviewerOrBot("coderabbitai[bot]", "## CodeRabbit Summary\n### Issues found"), true);
check("T3 vercel excluded", isExcludedBot("Vercel deployment failed", "vercel[bot]"), true);
check("T4 wobblus excluded", isExcludedBot("my own comment", "wobblus"), true);
check("T5 action patterns", extractActionPatterns("Stage 2 verdict: PASS 93/100, NOTE-1, NOTE-2"), ["NOTE-1", "NOTE-2", "PASS"]);
check("T6 no action", extractActionPatterns("LGTM, nice work"), []);
check("T7 inline thread nikaya", isReviewerOrBot("nikaya", "Line 42: this should be async — must fix"), true);
check("T8 random user not reviewer", isReviewerOrBot("someuser", "looks good"), false);
check("T9 action-item pattern", extractActionPatterns("Action item: fix the schema"), ["ACTION-ITEM"]);
check("T10 FAIL pattern", extractActionPatterns("Verdict: FAIL — 3 issues"), ["FAIL"]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
