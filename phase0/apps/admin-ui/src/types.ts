/** Shared types for the Admin UI */

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
  sessionExpiry: number | null;
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  traceId?: string;
}

/** Pagination parameters */
export interface PaginationParams {
  page: number;
  limit: number;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Date range filter */
export interface DateRange {
  from: string; // ISO 8601
  to: string; // ISO 8601
}

/** Kill switch states per ADR-111 BCP */
export type KillSwitchState = 'ARMED' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'LOCKED';

/** Feature flag status */
export type FlagStatus = 'active' | 'inactive' | 'partial';