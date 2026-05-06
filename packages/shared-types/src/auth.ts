export type UserRole = 'admin' | 'sre' | 'developer' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  sessionExpiry: number | null;
}

export interface SessionConfig {
  timeoutMs: number;
  ipLock: boolean;
}

export const SESSION_CONFIG: SessionConfig = {
  timeoutMs: 900000,
  ipLock: true,
} as const;
