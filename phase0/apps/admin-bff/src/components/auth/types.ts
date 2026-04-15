// Auth types

export interface User {
  email: string;
  role: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  sessionExpiry: number | null;
}

export const SESSION_CONFIG = {
  timeoutMs: 60 * 60 * 1000, // 1 hour
  ipLock: true,
};