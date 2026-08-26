import { describe, it, expect } from "bun:test";
import { adaptAuditEntry, type MachineAuditEntry } from "@/components/machines/machine-logs";
import type { ActivationRecord } from "@/types/shared";

// ─── Fixtures ────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<MachineAuditEntry> = {}): MachineAuditEntry {
  return {
    id: "audit-1",
    timestamp: "2026-08-26T12:00:00.000Z",
    userId: "user-42",
    reason: "Manual stop",
    previousState: "RUNNING",
    newState: "STOPPED",
    traceId: "trace-abc123",
    machineId: "m1",
    severity: "high",
    metadata: {},
    ...overrides,
  };
}

// ─── adaptAuditEntry ────────────────────────────────────────────────

describe("adaptAuditEntry", () => {
  it("maps all fields to the ActivationRecord shape", () => {
    const entry = makeEntry();
    const result = adaptAuditEntry(entry);

    expect(result).toEqual({
      id: "audit-1",
      timestamp: "2026-08-26T12:00:00.000Z",
      user: "user-42",
      reason: "Manual stop",
      previousState: "RUNNING",
      newState: "STOPPED",
      traceId: "trace-abc123",
    });
  });

  it("falls back to 'system' when userId is null", () => {
    const result = adaptAuditEntry(makeEntry({ userId: null }));
    expect(result.user).toBe("system");
  });

  it("falls back to empty string when reason is null", () => {
    const result = adaptAuditEntry(makeEntry({ reason: null }));
    expect(result.reason).toBe("");
  });

  it("falls back to 'ARMED' when previousState is null", () => {
    const result = adaptAuditEntry(makeEntry({ previousState: null }));
    expect(result.previousState).toBe("ARMED");
  });

  it("falls back to 'ARMED' when newState is null", () => {
    const result = adaptAuditEntry(makeEntry({ newState: null }));
    expect(result.newState).toBe("ARMED");
  });

  it("falls back to empty string when traceId is null", () => {
    const result = adaptAuditEntry(makeEntry({ traceId: null }));
    expect(result.traceId).toBe("");
  });

  it("preserves valid kill-switch states", () => {
    const result = adaptAuditEntry(
      makeEntry({ previousState: "ARMED", newState: "LOCKED" }),
    );
    expect(result.previousState).toBe("ARMED");
    expect(result.newState).toBe("LOCKED");
  });

  it("returns a valid ActivationRecord for a fully-null entry", () => {
    const result = adaptAuditEntry(
      makeEntry({
        userId: null,
        reason: null,
        previousState: null,
        newState: null,
        traceId: null,
      }),
    );
    expect(result).toEqual({
      id: "audit-1",
      timestamp: "2026-08-26T12:00:00.000Z",
      user: "system",
      reason: "",
      previousState: "ARMED",
      newState: "ARMED",
      traceId: "",
    });
  });
});
