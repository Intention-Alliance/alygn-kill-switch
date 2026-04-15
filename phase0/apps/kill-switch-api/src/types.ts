// Types — Re-exports from shared-types + local types

export type { KillSwitchState, KillSwitchStatus, ActivationRecord, UserRole, User } from '@phase0/shared-types';
export type { AuditEntry, TransitionMetadata } from './services/kill-switch';
export { STATES, VALID_TRANSITIONS } from './services/kill-switch';
export { IP_ALLOWLIST } from './services/ip-allowlist';
export { RATE_LIMIT_MAX } from './services/rate-limiter';