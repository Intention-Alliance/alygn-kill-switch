/**
 * ALYGN Shared Types — Local Mirror for web-regulator
 *
 * These types mirror @align/shared-types to avoid the monorepo
 * build dependency. Update when the canonical types change.
 */

// ─── Kill Switch ──────────────────────────────────────────────────

export type KillSwitchState =
  | "ARMED"
  | "RUNNING"
  | "STOPPING"
  | "STOPPED"
  | "LOCKED";

export interface KillSwitchStatus {
  state: KillSwitchState;
  lastActivation: string | null;
  lastActivationBy: string | null;
  activeExperiments: number;
  activatedAt: string | null;
  reason: string | null;
  recentTransitions?: unknown[];
}

export interface ActivationRecord {
  id: string;
  timestamp: string;
  user: string;
  reason: string;
  previousState: KillSwitchState;
  newState: KillSwitchState;
  traceId: string;
}

// ─── Feature Flags ─────────────────────────────────────────────────

export interface Flag {
  id: string;
  name: string;
  key: string;
  description: string;
  enabled: boolean;
  value: boolean | string | number;
  segments: unknown[];
  rolloutPercentage: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AuditEntry {
  id: string;
  flagId: string;
  action: string;
  oldValue: string;
  newValue: string;
  userId: string;
  timestamp: string;
  traceId: string;
}
