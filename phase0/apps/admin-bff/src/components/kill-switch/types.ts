// Kill Switch types (re-export from shared-types + local)

export type KillSwitchState = 'ARMED' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'LOCKED';

export interface KillSwitchStatus {
  state: KillSwitchState;
  lastActivation: string | null;
  lastActivationBy: string | null;
  activeExperiments: number;
  activatedAt: string | null;
  reason: string | null;
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

export const KILL_SWITCH_CONFIG = {
  pollInterval: 5000,
  confirmPhrase: 'STOP ALL CHAOS',
  sessionTimeout: 900000,
} as const;