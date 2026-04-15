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

function getCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') : null;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Strict; Secure`;
}

function fetchInitialIp(): Promise<string> {
  return fetch('/v1/auth/ip', { credentials: 'include' })
    .then((r) => r.json())
    .then((data: { ip: string }) => data.ip);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL_STATE);
  const [initialIp, setInitialIp] = useState<string | null>(null);

  // Restore session from cookie on mount
  useEffect(() => {
    const token = getCookie('admin_token');
    if (!token) return;

    fetch('/v1/auth/me', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Session invalid');
        return res.json();
      })
      .then((user: User) => {
        setState({
          isAuthenticated: true,
          user,
          token,
          sessionExpiry: Date.now() + SESSION_CONFIG.timeoutMs,
        });
      })
      .catch(() => {
        deleteCookie('admin_token');
        setState(INITIAL_STATE);
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
    window.fetch = function (...args) {
      return originalFetch(...args).then(async (response) => {
        const responseIp = response.headers.get('X-Client-IP');
        if (responseIp && responseIp !== initialIp) {
          logout();
          window.location.href = '/login?reason=ip_changed';
          return response;
        }
        return response;
      });
    };

    return () => {
      window.fetch = originalFetch;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isAuthenticated, initialIp]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/v1/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Login failed' }));
      throw new Error((err as { message: string }).message);
    }

    const { user } = (await res.json()) as { user: User };
    const token = getCookie('admin_token');

    setState({
      isAuthenticated: true,
      user,
      token,
      sessionExpiry: Date.now() + SESSION_CONFIG.timeoutMs,
    });
  }, []);

  const logout = useCallback(() => {
    fetch('/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(
      () => {},
    );
    deleteCookie('admin_token');
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