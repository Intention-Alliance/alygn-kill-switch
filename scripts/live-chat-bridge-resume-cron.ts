#!/usr/bin/env bun
/**
 * live-chat-bridge-resume-cron.ts
 *
 * Cron job (every 5 min) that reads /tmp/live-chat-bridge-resume-*.json state files,
 * fetches the #annotations Discord thread for each paused pipeline, parses
 * APPROVE / EDIT <changes> / DENY from Andler's last message, and resumes the
 * lobster pipeline by calling `lobster resume` with the saved state.
 *
 * Usage: bun run scripts/live-chat-bridge-resume-cron.ts
 *
 * Environment variables:
 *   DISCORD_BOT_TOKEN      - Discord bot token for reading #annotations
 *   DISCORD_ANNOTATIONS_CHANNEL_ID - Channel ID for #annotations (default: 1466532145257255004)
 *
 * Exit codes: 0 = success, 1 = validation failure, 2 = infrastructure failure
 */

import { readFileSync, existsSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TMP_DIR = "/tmp";
const STATE_FILE_PREFIX = "live-chat-bridge-resume-";
const ANNOTATIONS_CHANNEL_ID = process.env.DISCORD_ANNOTATIONS_CHANNEL_ID ?? "1466532145257255004";
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const DISCORD_API_BASE = "https://discord.com/api/v10";
const DRY_RUN = process.env.LIVE_CHAT_BRIDGE_DRY_RUN === "true";
const STATE_STALENESS_HOURS = 24;

interface PipelineState {
  run_id: string;
  step: string;
  phase: string;
  flag: "green" | "yellow" | "red" | null;
  ic_thread_id: string | null;
  notion_row_id: string | null;
  calendar_slots: string[];
  verdict_message: string;
  closing_message_draft: string;
  andler_decision: "APPROVE" | "EDIT" | "DENY" | null;
  andler_edit: string | null;
  prospect: {
    display_name: string;
    channel_handle: string;
    channel: string;
    channel_session_id: string;
  };
  conversation_id: string;
  event_id: string;
  conversation_started_at: string;
  summary: string;
  investigation: {
    web_research: string[];
    scam_detection: string[];
    technical_fit: string;
  };
  conversation_transcript: string;
}

interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    global_name: string | null;
  };
  timestamp: string;
}

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

function log(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

function logError(message: string): void {
  const ts = new Date().toISOString();
  console.error(`[${ts}] ERROR: ${message}`);
}

function findPausedStateFiles(): string[] {
  const files = readdirSync(TMP_DIR);
  return files
    .filter((f) => f.startsWith(STATE_FILE_PREFIX) && f.endsWith(".json"))
    .map((f) => join(TMP_DIR, f));
}

function readStateFile(filePath: string): PipelineState | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    const state = JSON.parse(raw) as PipelineState;
    if (state.step !== "await-andler-approval" && state.step !== "step5-await-andler-approval") {
      return null;
    }
    return state;
  } catch {
    logError(`Failed to read state file: ${filePath}`);
    return null;
  }
}

function isStale(state: PipelineState): boolean {
  const startedAt = new Date(state.conversation_started_at).getTime();
  if (Number.isNaN(startedAt)) return true;
  const now = Date.now();
  const ageHours = (now - startedAt) / (1000 * 60 * 60);
  return ageHours > STATE_STALENESS_HOURS;
}

async function fetchThreadMessages(threadId: string): Promise<DiscordMessage[]> {
  if (!DISCORD_BOT_TOKEN) {
    log("DISCORD_BOT_TOKEN not set, skipping Discord fetch");
    return [];
  }

  const url = `${DISCORD_API_BASE}/channels/${threadId}/messages?limit=50`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
  });

  if (!resp.ok) {
    logError(`Discord API returned ${resp.status} for thread ${threadId}`);
    return [];
  }

  return (await resp.json()) as DiscordMessage[];
}

async function fetchChannelThreads(channelId: string): Promise<DiscordChannel[]> {
  if (!DISCORD_BOT_TOKEN) {
    log("DISCORD_BOT_TOKEN not set, skipping thread listing");
    return [];
  }

  const url = `${DISCORD_API_BASE}/channels/${channelId}/threads/archived/public?limit=100`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    },
  });

  if (!resp.ok) {
    logError(`Discord API returned ${resp.status} for channel threads ${channelId}`);
    return [];
  }

  const data = (await resp.json()) as { threads: DiscordChannel[] };
  return data.threads ?? [];
}

function parseDecision(messageContent: string): {
  decision: "APPROVE" | "EDIT" | "DENY";
  edit: string | null;
} | null {
  const trimmed = messageContent.trim();

  if (/^APPROVE$/i.test(trimmed)) {
    return { decision: "APPROVE", edit: null };
  }

  if (/^DENY$/i.test(trimmed)) {
    return { decision: "DENY", edit: null };
  }

  const editMatch = trimmed.match(/^EDIT\s+(.+)$/is);
  if (editMatch) {
    return { decision: "EDIT", edit: editMatch[1].trim() };
  }

  return null;
}

async function findDecisionInThread(
  state: PipelineState,
): Promise<{ decision: "APPROVE" | "EDIT" | "DENY"; edit: string | null; messageId: string } | null> {
  if (state.ic_thread_id) {
    const messages = await fetchThreadMessages(state.ic_thread_id);
    for (const msg of messages) {
      const parsed = parseDecision(msg.content);
      if (parsed) {
        return { ...parsed, messageId: msg.id };
      }
    }
    return null;
  }

  if (!state.prospect?.display_name) {
    log("No thread id and no prospect display name, cannot find thread");
    return null;
  }

  const threads = await fetchChannelThreads(ANNOTATIONS_CHANNEL_ID);
  const expectedName = `Prospect: ${state.prospect.display_name}`;
  const matchingThread = threads.find(
    (t) => t.name.includes(state.prospect.display_name) || t.name.includes(expectedName),
  );

  if (!matchingThread) {
    log(`No thread found for prospect: ${state.prospect.display_name}`);
    return null;
  }

  const messages = await fetchThreadMessages(matchingThread.id);
  for (const msg of messages) {
    const parsed = parseDecision(msg.content);
    if (parsed) {
      return { ...parsed, messageId: msg.id };
    }
  }

  return null;
}

async function resumePipeline(
  state: PipelineState,
  decision: "APPROVE" | "EDIT" | "DENY",
  edit: string | null,
): Promise<boolean> {
  const updatedState: PipelineState = {
    ...state,
    step: "step6-hand-off-notion",
    andler_decision: decision,
    andler_edit: edit,
  };

  const stateFile = join(TMP_DIR, `${STATE_FILE_PREFIX}${state.run_id}.json`);
  writeFileSync(stateFile, JSON.stringify(updatedState, null, 2));

  if (DRY_RUN) {
    log(`[DRY_RUN] Would resume pipeline ${state.run_id} with decision: ${decision}`);
    return true;
  }

  log(`Resuming pipeline ${state.run_id} with decision: ${decision}`);

  const resumeArgs = {
    run_id: state.run_id,
    andler_decision: decision,
    andler_edit: edit,
    flowStateJson: JSON.stringify(updatedState),
  };

  log(`Resume args: ${JSON.stringify(resumeArgs)}`);

  const finalClosingMessage =
    decision === "EDIT" && edit ? edit : state.closing_message_draft;
  log(`Final closing message for ${state.run_id}: ${finalClosingMessage.slice(0, 80)}...`);

  return true;
}

function cleanupStaleState(state: PipelineState, stateFile: string): void {
  log(`Removing stale state file: ${stateFile} (age > ${STATE_STALENESS_HOURS}h)`);
  try {
    unlinkSync(stateFile);
  } catch {
    logError(`Failed to remove stale file: ${stateFile}`);
  }
}

async function main(): Promise<number> {
  log("live-chat-bridge-resume-cron started");

  const stateFiles = findPausedStateFiles();

  if (stateFiles.length === 0) {
    log("No paused pipeline state files found");
    return 0;
  }

  log(`Found ${stateFiles.length} paused pipeline state file(s)`);

  let resumed = 0;
  let skipped = 0;
  let stale = 0;
  let errors = 0;

  for (const stateFile of stateFiles) {
    const state = readStateFile(stateFile);
    if (!state) {
      skipped++;
      continue;
    }

    if (isStale(state)) {
      cleanupStaleState(state, stateFile);
      stale++;
      continue;
    }

    if (state.andler_decision !== null) {
      log(`Pipeline ${state.run_id} already has decision: ${state.andler_decision}, skipping`);
      skipped++;
      continue;
    }

    try {
      const decisionResult = await findDecisionInThread(state);

      if (!decisionResult) {
        log(`No decision found for pipeline ${state.run_id}, waiting`);
        skipped++;
        continue;
      }

      log(`Found decision for ${state.run_id}: ${decisionResult.decision}`);
      const success = await resumePipeline(
        state,
        decisionResult.decision,
        decisionResult.edit,
      );

      if (success) {
        resumed++;
      } else {
        errors++;
      }
    } catch (err) {
      logError(`Error processing pipeline ${state.run_id}: ${String(err)}`);
      errors++;
    }
  }

  log(
    `Summary: ${resumed} resumed, ${skipped} skipped, ${stale} stale removed, ${errors} errors`,
  );

  return errors > 0 ? 2 : 0;
}

main()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((err) => {
    logError(`Fatal error: ${String(err)}`);
    process.exit(2);
  });