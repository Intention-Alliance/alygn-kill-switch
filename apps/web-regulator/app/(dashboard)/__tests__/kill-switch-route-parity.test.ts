/**
 * Route parity — /kill-switch MUST render the same components as /?tab=kill-switch
 *
 * This is the source-level guard for the S5 requirement. It reads the files
 * and asserts the requirement itself, so it fails loudly if anyone
 * re-introduces a tab-local copy of the kill-switch surface.
 *
 * No browser runner needed (the app has no Playwright/jsdom dependency).
 */

import { describe, it, expect } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const TABS = join(ROOT, "app", "(dashboard)", "dashboard-tabs.tsx");
const PAGE = join(ROOT, "app", "(dashboard)", "kill-switch", "page.tsx");
const VIEW = join(ROOT, "components", "kill-switch", "kill-switch-view.tsx");

async function read(path: string): Promise<string> {
  return await Bun.file(path).text();
}

describe("S5 — kill-switch route parity", () => {
  it("dashboard-tabs no longer defines the tab-local duplicates", async () => {
    const src = await read(TABS);
    expect(src).not.toContain("function KillSwitchTab");
    expect(src).not.toContain("function ResumeButton");
    expect(src).not.toContain("function ConnectionNotice");
  });

  it("dashboard-tabs renders the shared KillSwitchView", async () => {
    const src = await read(TABS);
    expect(src).toContain("@/components/kill-switch/kill-switch-view");
    expect(src).toContain("<KillSwitchView");
  });

  it("the /kill-switch page renders the same shared KillSwitchView", async () => {
    const src = await read(PAGE);
    expect(src).toContain("@/components/kill-switch/kill-switch-view");
    expect(src).toContain("<KillSwitchView");
  });

  it("both call sites pass the same prop names", async () => {
    const required = ["status", "auditLog", "isConnected", "reconnectAttempt", "onStateChange"];
    for (const path of [TABS, PAGE]) {
      const src = await read(path);
      const block = src.slice(src.indexOf("<KillSwitchView"));
      const jsx = block.slice(0, block.indexOf("/>"));
      for (const prop of required) {
        expect(jsx).toContain(`${prop}=`);
      }
    }
  });

  it("the view is presentational — it never calls the websocket hook", async () => {
    const src = await read(VIEW);
    // Assert the import and the call, not a bare substring: the file's doc
    // comment mentions the hook name to explain why it is NOT used.
    expect(src).not.toContain("use-kill-switch-websocket");
    expect(src).not.toContain("useKillSwitchWebSocket(");
  });

  it("the view exports the parity manifest in section order", async () => {
    const src = await read(VIEW);
    expect(src).toContain("KILL_SWITCH_SECTIONS");
    const order = [
      "connection-notice",
      "header",
      "verification-badge",
      "status-card",
      "controls",
      "activation-history",
      "inference-logs",
    ];
    // The array literal must list the sections in this order.
    const start = src.indexOf("KILL_SWITCH_SECTIONS");
    const literal = src.slice(start, src.indexOf("] as const", start));
    let cursor = -1;
    for (const section of order) {
      const at = literal.indexOf(`"${section}"`);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("the view renders each section marker", async () => {
    const src = await read(VIEW);
    expect(src).toContain("<ConnectionNotice");
    expect(src).toContain("Verification:");
    expect(src).toContain("System Status");
    expect(src).toContain("Controls");
    expect(src).toContain("<ActivationHistory");
    expect(src).toContain("<InferenceLogs");
  });
});
