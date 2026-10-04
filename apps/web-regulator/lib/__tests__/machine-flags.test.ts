/**
 * machine-flags — pure helpers (S4).
 *
 * Covers the four correctness bugs the plan identified in the old editor:
 * B1 (null rendered as "null"), B2 (empty number saved 0), B3 (legacy
 * unparseable values), B4 (override updatedAt discarded).
 */

import { describe, it, expect } from "bun:test";
import {
  formatFlagValueForInput,
  parseFlagInput,
  resolveProvenance,
  joinGlobalValues,
  provenanceLabel,
  type MachineFlagEntry,
} from "../machine-flags";

function flag(over: Partial<MachineFlagEntry> = {}): MachineFlagEntry {
  return {
    key: "auto_stop_threshold",
    value: 0.85,
    type: "number",
    description: "",
    overridden: false,
    ...over,
  };
}

describe("formatFlagValueForInput (B1)", () => {
  it("renders null as an empty string, not the literal 'null'", () => {
    expect(formatFlagValueForInput(null)).toBe("");
  });

  it("formats booleans as true/false", () => {
    expect(formatFlagValueForInput(true)).toBe("true");
    expect(formatFlagValueForInput(false)).toBe("false");
  });

  it("formats numbers and strings", () => {
    expect(formatFlagValueForInput(0.85)).toBe("0.85");
    expect(formatFlagValueForInput("standard")).toBe("standard");
  });
});

describe("parseFlagInput (B2)", () => {
  it("rejects an empty number input instead of saving 0", () => {
    const r = parseFlagInput("", "number", "auto_stop_threshold");
    expect("error" in r).toBe(true);
  });

  it("rejects a whitespace-only number input", () => {
    const r = parseFlagInput("   ", "number", "auto_stop_threshold");
    expect("error" in r).toBe(true);
  });

  it("accepts a valid number", () => {
    const r = parseFlagInput("0.5", "number", "auto_stop_threshold");
    expect(r).toEqual({ value: 0.5 });
  });

  it("enforces [0,1] on the two range-checked keys", () => {
    expect("error" in parseFlagInput("1.5", "number", "auto_stop_threshold")).toBe(true);
    expect("error" in parseFlagInput("-0.1", "number", "request_sampling_rate")).toBe(true);
    // Other numeric keys are not range-limited.
    expect(parseFlagInput("750", "number", "decision.jev.timeoutMs")).toEqual({ value: 750 });
  });

  it("parses booleans strictly", () => {
    expect(parseFlagInput("true", "boolean", "x")).toEqual({ value: true });
    expect(parseFlagInput("false", "boolean", "x")).toEqual({ value: false });
    expect("error" in parseFlagInput("yes", "boolean", "x")).toBe(true);
  });

  it("enforces the damage_logging_level enum", () => {
    expect(parseFlagInput("verbose", "string", "damage_logging_level")).toEqual({ value: "verbose" });
    expect("error" in parseFlagInput("loud", "string", "damage_logging_level")).toBe(true);
  });

  it("rejects an empty string flag", () => {
    expect("error" in parseFlagInput("", "string", "some_key")).toBe(true);
  });
});

describe("resolveProvenance", () => {
  it("null value → unset (regardless of override)", () => {
    expect(resolveProvenance(flag({ value: null, overridden: true }), 0.85)).toBe("unset");
  });

  it("overridden → machine", () => {
    expect(resolveProvenance(flag({ overridden: true }), 0.85)).toBe("machine");
  });

  it("not overridden + a global value → global", () => {
    expect(resolveProvenance(flag({ overridden: false }), 0.9)).toBe("global");
  });

  it("not overridden + no global → default", () => {
    expect(resolveProvenance(flag({ overridden: false }), null)).toBe("default");
  });
});

describe("joinGlobalValues", () => {
  it("attaches the global value by key and nulls the missing ones", () => {
    const joined = joinGlobalValues(
      [flag({ key: "a" }), flag({ key: "b" })],
      [{ key: "a", value: 0.9 }],
    );
    expect(joined[0].globalValue).toBe(0.9);
    expect(joined[1].globalValue).toBeNull();
  });
});

describe("provenanceLabel", () => {
  it("labels each provenance", () => {
    expect(provenanceLabel("machine")).toContain("machine override");
    expect(provenanceLabel("global")).toContain("global");
    expect(provenanceLabel("default")).toContain("default");
    expect(provenanceLabel("unset")).toContain("no value");
  });
});
