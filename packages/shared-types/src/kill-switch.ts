export type KillSwitchState = 'ARMED' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'LOCKED';

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

export interface KillSwitchConfig {
  pollInterval: number;
  confirmPhrase: string;
  sessionTimeout: number;
}

export const KILL_SWITCH_CONFIG: KillSwitchConfig = {
  pollInterval: 5000,
  confirmPhrase: 'STOP ALL CHAOS',
  sessionTimeout: 900000,
} as const;

// ─── Machine Types ───────────────────────────────────────────────

export interface MachineSpecs {
  cpu: string;
  ram: string;
  gpu: string;
  dpu: string | null;
}

export type MachineStatus = 'active' | 'inactive' | 'offline';

export interface Machine {
  id: string;
  name: string;
  hostname: string;
  status: MachineStatus;
  role: string;
  lastSeen: string; // ISO timestamp
  createdAt: string; // ISO timestamp
  hasDpu: boolean;
  specs: MachineSpecs;
  cpuUsage?: number;
  memoryUsage?: number;
  // ADR-138: monitoring-only until onboarding is fully completed — the
  // machine may report telemetry but cannot receive active responses.
  monitoringOnly?: boolean;
  // ADR-137/138: zone assignment (default 'unassigned').
  zone?: string;
}

export interface DpuInfo {
  available: boolean;
  type: string | null;
  version: string | null;
  status: 'active' | 'inactive' | 'error';
}

// ─── Agent Types ──────────────────────────────────────────────────

export interface AgentInfo {
  id: string;
  machineId: string;
  name: string;
  version: string;
  capabilities: string[];
  lastHeartbeat: string | null;
  createdAt: string;
}

// ─── Active Flag with Source Info ─────────────────────────────────

export interface ActiveFlagInfo {
  key: string;
  value: string;
  source: 'global' | 'machine';
  machineId?: string;
}

// ─── WebSocket Message Types ──────────────────────────────────────

export interface BaseWebSocketMessage {
  type: string;
  timestamp: string;
}

export interface StateChangeMessage extends BaseWebSocketMessage {
  type: 'state-change';
  payload: {
    state: KillSwitchState;
    previousState: KillSwitchState;
    timestamp: string;
    user: string;
    reason: string;
  };
}

export interface FlagUpdateMessage extends BaseWebSocketMessage {
  type: 'flag-update';
  payload: {
    flagId: string;
    key: string;
    value: string;
    machineId?: string;
    action: 'created' | 'updated' | 'deleted';
    updatedBy: string;
    timestamp: string;
  };
}

export interface AgentEventMessage extends BaseWebSocketMessage {
  type: 'agent-event';
  payload: {
    agentId: string;
    machineId: string;
    event: string;
    score?: number;
    timestamp: string;
  };
}

export interface AuditEntryMessage extends BaseWebSocketMessage {
  type: 'audit-entry';
  payload: ActivationRecord;
}

export interface HeartbeatMessage extends BaseWebSocketMessage {
  type: 'heartbeat';
  payload: { timestamp: string };
}

export interface MachineMetricsMessage extends BaseWebSocketMessage {
  type: 'machine-metrics';
  payload: {
    cpuUsage: number;
    memoryUsage: number;
    gpuUsage: number;
    gpuModel: string;
    dpuStatus: string;
    loadAvg: number;
    uptime: number;
    diskUsage: number;
    timestamp: number;
  };
}

export type WebSocketMessage =
  | StateChangeMessage
  | FlagUpdateMessage
  | AgentEventMessage
  | AuditEntryMessage
  | HeartbeatMessage
  | MachineMetricsMessage;

// ─── Settings Types ───────────────────────────────────────────────

export interface AppSettings {
  autoPollInterval: number;
  enableNotifications: boolean;
  auditLogRetentionDays: number;
  sessionTimeoutMinutes: number;
  ipAllowlistEnabled: boolean;
  rateLimitPerMinute: number;
}

export type RawSettings = Record<string, string>;

export function parseSettings(raw: RawSettings): AppSettings {
  return {
    autoPollInterval: parseInt(raw.auto_poll_interval ?? '5000', 10),
    enableNotifications: raw.enable_notifications === 'true',
    auditLogRetentionDays: parseInt(raw.audit_log_retention_days ?? '30', 10),
    sessionTimeoutMinutes: parseInt(raw.session_timeout_minutes ?? '60', 10),
    ipAllowlistEnabled: raw.ip_allowlist_enabled === 'true',
    rateLimitPerMinute: parseInt(raw.rate_limit_per_minute ?? '100', 10),
  };
}

export function serializeSettings(settings: Partial<AppSettings>): RawSettings {
  const result: RawSettings = {};
  if (settings.autoPollInterval !== undefined) result.auto_poll_interval = String(settings.autoPollInterval);
  if (settings.enableNotifications !== undefined) result.enable_notifications = String(settings.enableNotifications);
  if (settings.auditLogRetentionDays !== undefined) result.audit_log_retention_days = String(settings.auditLogRetentionDays);
  if (settings.sessionTimeoutMinutes !== undefined) result.session_timeout_minutes = String(settings.sessionTimeoutMinutes);
  if (settings.ipAllowlistEnabled !== undefined) result.ip_allowlist_enabled = String(settings.ipAllowlistEnabled);
  if (settings.rateLimitPerMinute !== undefined) result.rate_limit_per_minute = String(settings.rateLimitPerMinute);
  return result;
}
