// Kill Switch types — re-export from shared-types + local extensions

export type {
	ActivationRecord,
	KillSwitchState,
	KillSwitchStatus,
	User,
	UserRole,
} from "@align/shared-types";
export { AUTH_RATE_LIMIT_MAX } from "./middleware/auth-rate-limit";
export { RATE_LIMIT_MAX } from "./middleware/rate-limit";
export { ALLOWED_IPS, CIDR_RANGES } from "./services/ip-allowlist";
export { STATES } from "./services/kill-switch";
