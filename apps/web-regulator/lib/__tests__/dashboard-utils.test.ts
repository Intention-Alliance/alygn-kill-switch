import { describe, it, expect } from "bun:test";
import { effectiveStatus } from "@/lib/dashboard-utils";
import type { Machine } from "@/types/shared";

// ─── Fixtures ────────────────────────────────────────────────────────

function makeMachine(overrides: Partial<Machine> = {}): Machine {
  return {
    id: "m1",
    name: "node-1",
    hostname: "node-1.local",
    status: "active",
    role: "worker",
    lastSeen: "2026-08-26T12:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    hasDpu: false,
    specs: { cpu: "8", ram: "16GB", gpu: "A100", dpu: null },
    ...overrides,
  };
}

// ─── effectiveStatus ────────────────────────────────────────────────

describe("effectiveStatus", () => {
  it("returns 'pending' when status is explicitly 'pending'", () => {
    const machine = makeMachine({ status: "pending" });
    expect(effectiveStatus(machine)).toBe("pending");
  });

  it("returns 'active' when connected is true", () => {
    const machine = makeMachine({ connected: true });
    expect(effectiveStatus(machine)).toBe("active");
  });

  it("returns 'offline' when connected is false and lastSeen is present (lost heartbeat)", () => {
    const machine = makeMachine({
      connected: false,
      lastSeen: "2026-08-26T12:00:00.000Z",
    });
    expect(effectiveStatus(machine)).toBe("offline");
  });

  it("returns 'pending' when connected is false and lastSeen is null (never connected)", () => {
    const machine = makeMachine({
      connected: false,
      lastSeen: "2026-08-26T12:00:00.000Z",
    });
    // Override lastSeen to null to simulate a machine that never connected.
    machine.lastSeen = null as unknown as string;
    expect(effectiveStatus(machine)).toBe("pending");
  });

  it("returns 'pending' when connected is false and lastSeen is undefined", () => {
    const machine = makeMachine({ connected: false });
    delete (machine as { lastSeen?: string }).lastSeen;
    expect(effectiveStatus(machine)).toBe("pending");
  });

  it("falls back to the reported status when connected is undefined", () => {
    const machine = makeMachine({ status: "inactive" });
    expect(effectiveStatus(machine)).toBe("inactive");
  });

  it("falls back to the reported status when connected is undefined and status is 'offline'", () => {
    const machine = makeMachine({ status: "offline" });
    expect(effectiveStatus(machine)).toBe("offline");
  });

  it("returns 'active' for an active machine with connected undefined", () => {
    const machine = makeMachine({ status: "active" });
    expect(effectiveStatus(machine)).toBe("active");
  });

  it("treats connected: true as active even if status is 'inactive'", () => {
    const machine = makeMachine({ status: "inactive", connected: true });
    expect(effectiveStatus(machine)).toBe("active");
  });

  it("treats connected: false with lastSeen as offline even if status is 'active'", () => {
    const machine = makeMachine({
      status: "active",
      connected: false,
      lastSeen: "2026-08-26T12:00:00.000Z",
    });
    expect(effectiveStatus(machine)).toBe("offline");
  });
});
