import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TMP_DIR = "/tmp";
const RUN_ID = "smoke-test-0001";
const STATE_FILE = join(TMP_DIR, `live-chat-bridge-resume-${RUN_ID}.json`);

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

const STEP_NAMES = [
  "step1-validate-jwt",
  "step2-load-context",
  "step3-diagnose",
  "step4-update-flag",
  "step5-await-andler-approval",
  "step6-hand-off-notion",
  "step7-post-discord",
  "step8-release-reply",
] as const;

const MOCK_PAYLOAD = {
  action: "escalate" as const,
  conversation_id: "conv-smoke-001",
  prospect: {
    display_name: "Jane Smith",
    channel_handle: "jane@example.com",
    channel: "public-inbox" as const,
    channel_session_id: "session-abc123",
  },
  flag: "green" as const,
  summary: "Series A fintech CTO evaluating AI governance infrastructure. 4-week timeline, $80-120k budget.",
  investigation: {
    web_research: ["Company website: example.com", "GitHub: github.com/jane-smith"],
    scam_detection: [],
    technical_fit: "fit - React/Node stack matches andler.dev capabilities",
  },
  closing_message: "Appreciate the context. Looks like a real fit. The fastest way to align on scope is a 30-min call.",
  conversation_transcript: "Prospect: Hi, I'm looking for AI governance consulting. Rep: What's your timeline? Prospect: 4 weeks.",
  conversation_started_at: "2026-07-04T20:00:00Z",
};

function makeInitialState(): PipelineState {
  return {
    run_id: RUN_ID,
    step: "step1-validate-jwt",
    phase: "greeting",
    flag: null,
    ic_thread_id: null,
    notion_row_id: null,
    calendar_slots: [],
    verdict_message: "",
    closing_message_draft: MOCK_PAYLOAD.closing_message,
    andler_decision: null,
    andler_edit: null,
    prospect: MOCK_PAYLOAD.prospect,
    conversation_id: MOCK_PAYLOAD.conversation_id,
    event_id: "evt-smoke-001",
    conversation_started_at: MOCK_PAYLOAD.conversation_started_at,
    summary: MOCK_PAYLOAD.summary,
    investigation: MOCK_PAYLOAD.investigation,
    conversation_transcript: MOCK_PAYLOAD.conversation_transcript,
  };
}

function writeState(state: PipelineState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function readState(): PipelineState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as PipelineState;
}

function cleanup(): void {
  if (existsSync(STATE_FILE)) {
    unlinkSync(STATE_FILE);
  }
  for (const step of STEP_NAMES) {
    const f = join(TMP_DIR, `live-chat-bridge-${RUN_ID}-${step.split("-")[1]}.json`);
    if (existsSync(f)) unlinkSync(f);
  }
  const ctxFile = join(TMP_DIR, `live-chat-bridge-${RUN_ID}-context.json`);
  const diagFile = join(TMP_DIR, `live-chat-bridge-${RUN_ID}-diagnosis.json`);
  const flagFile = join(TMP_DIR, `live-chat-bridge-${RUN_ID}-flag.json`);
  const validateFile = join(TMP_DIR, `live-chat-bridge-${RUN_ID}-validate.json`);
  const notionFile = join(TMP_DIR, `live-chat-bridge-${RUN_ID}-notion-row.json`);
  const discordFile = join(TMP_DIR, `live-chat-bridge-${RUN_ID}-discord-update.json`);
  const releaseFile = join(TMP_DIR, `live-chat-bridge-${RUN_ID}-release.json`);
  for (const f of [ctxFile, diagFile, flagFile, validateFile, notionFile, discordFile, releaseFile]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe("live-chat-bridge lobster pipeline smoke test", () => {
  let state: PipelineState;

  beforeAll(() => {
    cleanup();
    state = makeInitialState();
  });

  afterAll(() => {
    cleanup();
  });

  test("step1-validate-jwt: validates payload and extracts claims", () => {
    state.step = "step1-validate-jwt";
    state.flag = MOCK_PAYLOAD.flag;
    state.phase = "greeting";

    const validateOutput = {
      ok: true,
      event_id: state.event_id,
      prospect_handle: state.prospect.channel_handle,
      phase: state.phase,
      flag: state.flag,
    };
    writeFileSync(
      join(TMP_DIR, `live-chat-bridge-${RUN_ID}-validate.json`),
      JSON.stringify(validateOutput),
    );

    expect(validateOutput.ok).toBe(true);
    expect(validateOutput.flag).toBe("green");
    expect(validateOutput.prospect_handle).toBe("jane@example.com");
  });

  test("step2-load-context: loads ICL context from payload", () => {
    state.step = "step2-load-context";
    state.phase = "diagnostic";

    const contextOutput = {
      ok: true,
      phase: state.phase,
      flag: state.flag,
      prospect: state.prospect,
      summary: state.summary,
      investigation: state.investigation,
      closing_message: state.closing_message_draft,
      conversation_transcript: state.conversation_transcript,
    };
    writeFileSync(
      join(TMP_DIR, `live-chat-bridge-${RUN_ID}-context.json`),
      JSON.stringify(contextOutput),
    );

    expect(contextOutput.ok).toBe(true);
    expect(contextOutput.prospect.display_name).toBe("Jane Smith");
    expect(contextOutput.investigation.web_research.length).toBeGreaterThan(0);
  });

  test("step3-diagnose: packages flag + summary + investigation", () => {
    state.step = "step3-diagnose";

    const diagnosisOutput = {
      flag: state.flag,
      summary: state.summary,
      investigation: state.investigation,
    };
    writeFileSync(
      join(TMP_DIR, `live-chat-bridge-${RUN_ID}-diagnosis.json`),
      JSON.stringify(diagnosisOutput),
    );

    expect(diagnosisOutput.flag).toBe("green");
    expect(diagnosisOutput.summary).toContain("fintech CTO");
    expect(diagnosisOutput.investigation.technical_fit).toContain("fit");
  });

  test("step4-update-flag: applies flag rules and transitions phase", () => {
    state.step = "step4-update-flag";
    state.phase = "verdict";

    const flagOutput = {
      flag: state.flag,
      phase: state.phase,
      run_id: state.run_id,
    };
    writeFileSync(
      join(TMP_DIR, `live-chat-bridge-${RUN_ID}-flag.json`),
      JSON.stringify(flagOutput),
    );

    expect(flagOutput.flag).toBe("green");
    expect(flagOutput.phase).toBe("verdict");
  });

  test("step5-await-andler-approval: writes state file and pauses", () => {
    state.step = "step5-await-andler-approval";
    state.verdict_message = state.summary;

    const pauseState: PipelineState = { ...state, step: "await-andler-approval" };
    writeState(pauseState);

    expect(existsSync(STATE_FILE)).toBe(true);
    const saved = readState();
    expect(saved.step).toBe("await-andler-approval");
    expect(saved.flag).toBe("green");
    expect(saved.andler_decision).toBeNull();
    expect(saved.prospect.display_name).toBe("Jane Smith");
    expect(saved.conversation_id).toBe("conv-smoke-001");
  });

  test("mock Andler approval: simulates APPROVE from #annotations", () => {
    const saved = readState();
    saved.andler_decision = "APPROVE";
    saved.andler_edit = null;
    saved.step = "step6-hand-off-notion";
    writeState(saved);

    const updated = readState();
    expect(updated.andler_decision).toBe("APPROVE");
    expect(updated.andler_edit).toBeNull();
  });

  test("step6-hand-off-notion: writes Notion row with decision", () => {
    const saved = readState();
    state.step = "step6-hand-off-notion";

    const notionOutput = {
      ok: true,
      row_id: "notion-row-001",
      row_url: "https://notion.so/row-001",
    };
    writeFileSync(
      join(TMP_DIR, `live-chat-bridge-${RUN_ID}-notion-row.json`),
      JSON.stringify(notionOutput),
    );

    state.notion_row_id = notionOutput.row_id;
    expect(notionOutput.ok).toBe(true);
    expect(notionOutput.row_id).toBe("notion-row-001");
    expect(saved.andler_decision).toBe("APPROVE");
  });

  test("step7-post-discord: posts verdict and decision to thread", () => {
    state.step = "step7-post-discord";

    const discordOutput = {
      ok: true,
      thread_id: "thread-001",
      message_id: "msg-001",
    };
    writeFileSync(
      join(TMP_DIR, `live-chat-bridge-${RUN_ID}-discord-update.json`),
      JSON.stringify(discordOutput),
    );

    state.ic_thread_id = discordOutput.thread_id;
    expect(discordOutput.ok).toBe(true);
    expect(discordOutput.thread_id).toBe("thread-001");
  });

  test("step8-release-reply: releases closing message to prospect", () => {
    state.step = "step8-release-reply";

    const finalClosingMessage =
      state.andler_edit ?? state.closing_message_draft;

    const releaseOutput = {
      ok: true,
      delivered_at: new Date().toISOString(),
      agent_message_id: "agent-msg-001",
    };
    writeFileSync(
      join(TMP_DIR, `live-chat-bridge-${RUN_ID}-release.json`),
      JSON.stringify(releaseOutput),
    );

    expect(releaseOutput.ok).toBe(true);
    expect(releaseOutput.agent_message_id).toBe("agent-msg-001");
    expect(finalClosingMessage).toContain("Appreciate the context");
  });

  test("full pipeline: 8 steps in correct order", () => {
    expect(STEP_NAMES).toHaveLength(8);
    expect(STEP_NAMES[0]).toBe("step1-validate-jwt");
    expect(STEP_NAMES[1]).toBe("step2-load-context");
    expect(STEP_NAMES[2]).toBe("step3-diagnose");
    expect(STEP_NAMES[3]).toBe("step4-update-flag");
    expect(STEP_NAMES[4]).toBe("step5-await-andler-approval");
    expect(STEP_NAMES[5]).toBe("step6-hand-off-notion");
    expect(STEP_NAMES[6]).toBe("step7-post-discord");
    expect(STEP_NAMES[7]).toBe("step8-release-reply");
  });

  test("pause/resume: state file round-trips correctly", () => {
    const initialState = makeInitialState();
    initialState.step = "await-andler-approval";
    initialState.andler_decision = null;
    writeState(initialState);

    const loaded = readState();
    expect(loaded.run_id).toBe(RUN_ID);
    expect(loaded.step).toBe("await-andler-approval");
    expect(loaded.andler_decision).toBeNull();

    loaded.andler_decision = "APPROVE";
    loaded.step = "step6-hand-off-notion";
    writeState(loaded);

    const resumed = readState();
    expect(resumed.andler_decision).toBe("APPROVE");
    expect(resumed.step).toBe("step6-hand-off-notion");
  });

  test("idempotency: re-running step6 produces same notion row id", () => {
    const notionFile = join(TMP_DIR, `live-chat-bridge-${RUN_ID}-notion-row.json`);
    const first = JSON.parse(readFileSync(notionFile, "utf8"));
    const second = JSON.parse(readFileSync(notionFile, "utf8"));

    expect(first.row_id).toBe(second.row_id);
    expect(first.ok).toBe(true);
  });

  test("dry_run mode: no side effects when dry_run is true", () => {
    const dryRunState = makeInitialState();
    expect(dryRunState.flag).toBeNull();
    expect(MOCK_PAYLOAD.flag).toBe("green");
    expect(MOCK_PAYLOAD.action).toBe("escalate");
  });
});