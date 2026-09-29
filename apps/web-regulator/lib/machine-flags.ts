/**
 * Machine flags — pure helpers for the per-machine override UI (S4).
 *
 * No React, no DOM: this module is what makes the override surface
 * unit-testable with `bun test` (the app has no DOM test renderer).
 *
 * Resolution order (ADR-133): machine override > global > default.
 */

export type FlagValueType = "boolean" | "number" | "string";

/** Contract §3.1. `value` is the RESOLVED value. */
export interface MachineFlagEntry {
  key: string;
  value: boolean | number | string | null; // null = no value anywhere
  type: FlagValueType;
  description: string;
  overridden: boolean;
}

export interface MachineFlagOverride {
  flagKey: string;
  value: string; // raw machine_flag.value (TEXT)
  updatedAt: string;
}

export interface MachineFlagsResponse {
  machineId: string;
  flags: MachineFlagEntry[];
  overrides: MachineFlagOverride[];
}

/** Where the resolved value came from. Drives the provenance chip. */
export type FlagProvenance = "machine" | "global" | "default" | "unset";

export const DAMAGE_LEVEL_OPTIONS = ["minimal", "standard", "verbose"] as const;

/**
 * null-safe formatting for the input. Fixes B1: `String(null)` rendered the
 * literal "null" for a flag with no value anywhere.
 */
export function formatFlagValueForInput(v: boolean | number | string | null): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

export type ParseResult = { value: unknown; error?: undefined } | { error: string };

/**
 * Parses raw input for a declared type. Fixes B2: `Number("")` is 0 and
 * finite, so an empty number input silently saved 0.
 */
export function parseFlagInput(raw: string, type: FlagValueType, key: string): ParseResult {
  if (type === "boolean") {
    if (raw === "true" || raw === "false") return { value: raw === "true" };
    return { error: "Value must be true or false" };
  }

  if (type === "string") {
    if (key === "damage_logging_level") {
      if (DAMAGE_LEVEL_OPTIONS.includes(raw as (typeof DAMAGE_LEVEL_OPTIONS)[number])) {
        return { value: raw };
      }
      return { error: `Value must be one of: ${DAMAGE_LEVEL_OPTIONS.join(", ")}` };
    }
    if (raw.trim()) return { value: raw };
    return { error: "Value must not be empty" };
  }

  // number
  if (raw.trim() === "") return { error: "Value must not be empty" };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: "Value must be a number" };
  if (
    (key === "auto_stop_threshold" || key === "request_sampling_rate") &&
    (n < 0 || n > 1)
  ) {
    return { error: "Value must be in the range [0.0, 1.0]" };
  }
  return { value: n };
}

/**
 * Provenance from the merged view alone:
 *   value === null        -> "unset"
 *   overridden            -> "machine"
 *   !overridden && global -> "global"
 *   !overridden && !global-> "default"
 */
export function resolveProvenance(
  flag: MachineFlagEntry,
  globalValue: boolean | number | string | null | undefined,
): FlagProvenance {
  if (flag.value === null) return "unset";
  if (flag.overridden) return "machine";
  if (globalValue !== null && globalValue !== undefined) return "global";
  return "default";
}

/** Joins GET /api/flags onto the merged view so the UI can show "global: 0.85". */
export function joinGlobalValues(
  flags: MachineFlagEntry[],
  globals: Array<{ key: string; value: boolean | number | string }>,
): Array<MachineFlagEntry & { globalValue: boolean | number | string | null }> {
  const byKey = new Map(globals.map((g) => [g.key, g.value]));
  return flags.map((f) => ({
    ...f,
    globalValue: byKey.has(f.key) ? (byKey.get(f.key) as boolean | number | string) : null,
  }));
}

/** Human label for the resolution-order chip. */
export function provenanceLabel(p: FlagProvenance): string {
  switch (p) {
    case "machine":
      return "resolved from: machine override";
    case "global":
      return "resolved from: global";
    case "default":
      return "resolved from: default";
    case "unset":
      return "no value set";
  }
}
