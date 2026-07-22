/**
 * AdminUI Secrets — shared types for /admin/secrets surface.
 *
 * The rotated secret value NEVER leaves the server. None of these shapes
 * contain the raw value.
 */

export type LoaderHealthState = "ok" | "checking" | "error";

export type SecretState = "armed" | "locked";

export interface DependentConfig {
  name: string;
  type: string;
  path: string;
}

export interface ReloadTarget {
  name: string;
  pid: number;
  method: "sighup" | "fs.watch";
}

export interface SecretInfo {
  name: string;
  /** Masked display only, e.g. "tsau_••••••••aaaa" */
  maskedValue: string;
  lastRotatedAt: string;
  state: SecretState;
  /** Visible preview suffix that changes after rotation. */
  previewSuffix: string;
  dependentConfigs: DependentConfig[];
  reloadTargets: ReloadTarget[];
}

export interface SecretsLoaderHealth {
  state: LoaderHealthState;
  fsWatch: "ok" | "error";
  sighup: "armed" | "disarmed";
  lastPollAt: string;
  nextPollInSeconds: number;
  uptimeSeconds: number;
  lockouts: number;
}

export interface SecretsAuditEvent {
  id: string;
  at: string;
  event:
    | "rotate"
    | "rotate-consumer"
    | "view"
    | "401"
    | "401-block"
    | "401-storm"
    | "sighup"
    | "poll"
    | "lock"
    | "unlock";
  name: string;
  actor: string;
  result?: string;
  meta?: Record<string, unknown>;
}

export interface SecretsPageData {
  secrets: SecretInfo[];
  health: SecretsLoaderHealth;
  audit: SecretsAuditEvent[];
}

export interface RotateResult {
  name: string;
  rotatedAt: string;
  dependentConfigs: DependentConfig[];
  reloadTargets: ReloadTarget[];
  filesWritten: number;
  appsReloaded: number;
}

export interface LockoutState {
  name: string;
  autoUnlockAt: string;
  last401Source: string;
  count: number;
  windowSec: number;
}

export interface SecretsWebSocketMessage {
  type: "secrets:health" | "secrets:audit";
  payload: SecretsLoaderHealth | SecretsAuditEvent;
  timestamp: string;
}
