"use client";

/**
 * AuthProvider — Context wrapper for Better-Auth session state.
 *
 * Provides:
 * - user: current authenticated user
 * - isAuthenticated: whether the user is logged in
 * - login(email, password): authenticate
 * - logout(): clear session
 * - loading: session check in progress
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { authClient } from "./auth-client";

// ─── Types ────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "admin" | "sre" | "developer" | "viewer";
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Helpers ───────────────────────────────────────────────────────

function adaptUser(raw: Record<string, unknown> | null | undefined): AuthUser | null {
  if (!raw?.email) return null;

  return {
    id: (raw.id as string) || (raw.email as string) || "unknown",
    email: raw.email as string,
    name: (raw.name as string) || (raw.email as string) || "",
    role: (raw.role as AuthUser["role"]) || "viewer",
  };
}

// ─── Provider ──────────────────────────────────────────────────────

const SESSION_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes background refresh

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const isAuthenticated = user !== null;
  const wasAuthenticatedRef = useRef(isAuthenticated);

  // Restore session on mount
  useEffect(() => {
    let cancelled = false;

    authClient
      .getSession()
      .then((res) => {
        if (cancelled) return;
        if (res.error || !res.data) {
          setUser(null);
          return;
        }

        const data = res.data as { user?: Record<string, unknown> };
        const adapted = adaptUser(data.user);
        setUser(adapted);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Background session refresh
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      authClient
        .getSession()
        .then((res) => {
          if (res.error || !res.data) {
            setUser(null);
            return;
          }
          const data = res.data as { user?: Record<string, unknown> };
          const adapted = adaptUser(data.user);
          if (!adapted || adapted.id !== user.id) {
            setUser(null);
          }
        })
        .catch(() => {
          // Silent failure — don't log out on network errors
        });
    }, SESSION_POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [user]);

  // ─── Actions ───────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await authClient.signIn.email({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message ?? "Login failed");
    }

    const sessionData = data as { user?: Record<string, unknown> };
    const adapted = adaptUser(sessionData.user);

    if (!adapted) {
      throw new Error("Login succeeded but session data is invalid");
    }

    setUser(adapted);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authClient.signOut();
    } catch {
      // Session clearing failed — still clear local state
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      login,
      logout,
    }),
    [user, isAuthenticated, isLoading, login, logout],
  );

  // ─── Redirect on auth state change ─────────────────────────
  // When transitioning from authenticated → unauthenticated, redirect to login.
  // This covers logout from any component, not just the logout page.
  useEffect(() => {
    if (isLoading) return; // Don't redirect during session restoration
    if (wasAuthenticatedRef.current && !isAuthenticated) {
      router.push("/login");
    }
    wasAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated, isLoading, router]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
