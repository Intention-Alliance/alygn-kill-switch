/**
 * AuthProvider — Wraps the app with better-auth context.
 *
 * PREREQUISITES (before this works end-to-end):
 * 1. kill-switch-api must embed a better-auth server instance
 * 2. Server must export getSession, signIn, signOut endpoints
 * 3. Nginx must proxy the better-auth base path to the backend:
 *    ```
 *    location /v1/auth/ {
 *        proxy_pass http://kill_switch_api/v1/auth/;
 *        proxy_pass_header Set-Cookie;
 *        # ... standard proxy headers
 *    }
 *    ```
 *
 * The provider maintains the same public API (login, logout, isAuthenticated,
 * user) so consumers (LoginPage, ProtectedRoute, App) don't need changes.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthState, User } from './types';
import { SESSION_CONFIG } from './types';
import { authClient } from './better-auth-client';

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  initialIp: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const INITIAL_STATE: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  sessionExpiry: null,
};

function fetchInitialIp(): Promise<string> {
  return fetch('/v1/auth/ip', { credentials: 'include' })
    .then((r) => r.json())
    .then((data: { ip: string }) => data.ip);
}

/**
 * Adapt better-auth session response to our internal User type.
 * better-auth session.data contains { user, session }.
 */
function sessionToUser(
  sessionData: unknown,
): { user: User; sessionExpiry: number | null } | null {
  const data = sessionData as Record<string, unknown> | null | undefined;
  if (!data || !data.user) return null;

  const u = data.user as Record<string, unknown>;
  const s = data.session as Record<string, unknown> | undefined;

  return {
    user: {
      id: (u.id as string) || (u.email as string) || 'unknown',
      email: (u.email as string) || '',
      name: (u.name as string) || (u.email as string) || '',
      role: (u.role as User['role']) || 'viewer',
    },
    sessionExpiry: s?.expiresAt
      ? new Date(s.expiresAt as string).getTime()
      : Date.now() + SESSION_CONFIG.timeoutMs,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);
  const [initialIp, setInitialIp] = useState<string | null>(null);

  // Restore session from better-auth on mount
  useEffect(() => {
    authClient
      .getSession()
      .then((res) => {
        if (res.error || !res.data) return;
        const adapted = sessionToUser(res.data);
        if (!adapted) return;

        setState({
          isAuthenticated: true,
          user: adapted.user,
          token: null, // better-auth manages tokens internally
          sessionExpiry: adapted.sessionExpiry,
        });
      })
      .catch(() => {
        // Session restore failed — stay unauthenticated
      });
  }, []);

  // Fetch and store initial IP
  useEffect(() => {
    if (state.isAuthenticated && !initialIp) {
      fetchInitialIp()
        .then((ip) => setInitialIp(ip))
        .catch(() => {
          // IP detection failed — non-fatal
        });
    }
  }, [state.isAuthenticated, initialIp]);

  // IP lock: validate on each API response via fetch interceptor
  useEffect(() => {
    if (!state.isAuthenticated || !SESSION_CONFIG.ipLock || !initialIp) return;

    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      return originalFetch(...args).then(async (response) => {
        const responseIp = response.headers.get('X-Client-IP');
        if (responseIp && responseIp !== initialIp) {
          // Use the authClient for proper session clearing
          authClient.signOut().catch(() => {});
          setState(INITIAL_STATE);
          window.location.href = '/login?reason=ip_changed';
          return response;
        }
        return response;
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [state.isAuthenticated, initialIp]);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message ?? 'Login failed');
    }

    const adapted = sessionToUser(data);
    if (!adapted) {
      throw new Error('Login succeeded but session data is invalid');
    }

    setState({
      isAuthenticated: true,
      user: adapted.user,
      token: null,
      sessionExpiry: adapted.sessionExpiry,
    });
  }, []);

  const logout = useCallback(() => {
    authClient.signOut().catch(() => {
      // Session clearing failed — still clear local state
    });
    setState(INITIAL_STATE);
    setInitialIp(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, initialIp }),
    [state, login, logout, initialIp],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
