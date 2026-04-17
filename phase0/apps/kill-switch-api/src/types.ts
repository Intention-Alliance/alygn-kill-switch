// Kill Switch types — re-export from shared-types + local extensions

export type {
  KillSwitchState,
  KillSwitchStatus,
  ActivationRecord,
  UserRole,
  User,
} from '@phase0/shared-types';

export { STATES } from './services/kill-switch';
export { ALLOWED_IPS, CIDR_RANGES } from './services/ip-allowlist';
export { RATE_LIMIT_MAX } from './middleware/rate-limit';
export { AUTH_RATE_LIMIT_MAX } from './middleware/auth-rate-limit';