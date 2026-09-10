/**
 * Feature Flag Definitions — Single Source of Truth (ADR-133 + ADR-136/137)
 *
 * Central registry for the predefined feature flags: key, declared type,
 * default value, description, and display order.
 *
 * Consumed by:
 *   - db/seed.ts        → idempotent seed (reconciles by key, never collides)
 *   - routes/flags.ts   → declared types + merged per-machine view
 *
 * The `value` column of feature_flag is TEXT; typed defaults are stored as
 * their string form (see db/index.ts v1.2 migration).
 *
 * ADR-136/137 note: `kill.authorization.*` rows gate whether the WebAuthn
 * kill-authorization pipeline is enabled at all (boolean). The actual policy
 * values (mode, quorum, timeout) live in the `setting` table via the
 * settings API — see the legacy seed comment.
 */

export type FlagValueType = 'boolean' | 'number' | 'string';

export interface FlagDefinition {
  key: string;
  type: FlagValueType;
  defaultValue: boolean | number | string;
  description: string;
  order: number;
}

export const PREDEFINED_FLAG_DEFINITIONS: FlagDefinition[] = [
  {
    key: 'llm_interception_enabled',
    type: 'boolean',
    defaultValue: true,
    description: 'Master kill switch for LLM request interception',
    order: 1,
  },
  {
    key: 'auto_stop_threshold',
    type: 'number',
    defaultValue: 0.85,
    description: 'Semantic score threshold for auto-stop (default: 0.85)',
    order: 2,
  },
  {
    key: 'damage_logging_level',
    type: 'string',
    defaultValue: 'standard',
    description: 'Log level for damage events (default: warning)',
    order: 3,
  },
  {
    key: 'alert_on_critical_score',
    type: 'boolean',
    defaultValue: true,
    description: 'Emit alert when score exceeds threshold',
    order: 4,
  },
  {
    key: 'request_sampling_rate',
    type: 'number',
    defaultValue: 1.0,
    description: 'Fraction of requests to evaluate (0-1, default: 1.0)',
    order: 5,
  },
  // ─── ADR-136: Human-Signature Kill Authorization flags ─────────
  // Boolean gates: enable/disable the WebAuthn kill-authorization
  // pipeline. Policy values (mode/quorum/timeoutMs) live in `setting`.
  {
    key: 'kill.authorization.mode',
    type: 'boolean',
    defaultValue: true,
    description: 'Kill authorization mode: single | quorum (value in settings)',
    order: 6,
  },
  {
    key: 'kill.authorization.quorum',
    type: 'boolean',
    defaultValue: true,
    description: 'Quorum threshold for kill authorization (value in settings)',
    order: 7,
  },
  {
    key: 'kill.authorization.timeoutMs',
    type: 'boolean',
    defaultValue: true,
    description: 'Quorum window in ms (value in settings)',
    order: 8,
  },
];

/**
 * Legacy key → canonical key reconciliation map.
 *
 * The pre-v1.2 seed used different keys (`interception_enabled`,
 * `sampling_rate`). The seed renames any legacy rows to the canonical
 * keys so the UI, overrides, and the merged view all agree.
 */
export const LEGACY_FLAG_KEY_MAP: Record<string, string> = {
  interception_enabled: 'llm_interception_enabled',
  sampling_rate: 'request_sampling_rate',
};

/**
 * Stable, deterministic flag id derived from the key.
 * Replaces the old hardcoded ids that caused UNIQUE collisions on
 * re-seed against an existing database (F1).
 */
export function stableFlagId(key: string): string {
  return `flag-${key.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export function getFlagDefinition(key: string): FlagDefinition | undefined {
  return PREDEFINED_FLAG_DEFINITIONS.find((d) => d.key === key);
}

export function getFlagType(key: string): FlagValueType | null {
  return getFlagDefinition(key)?.type ?? null;
}
