/**
 * Dignity Verifier Dashboard — Better-Auth Client
 *
 * Super-admin only. Session tokens stored in httpOnly cookies (not
 * localStorage). CSRF via double-submit cookie pattern.
 *
 * The auth server is self-contained in this app (src/lib/auth.ts), served
 * at /api/auth via the Next.js route handler (src/app/api/auth/[...all]/route.ts).
 */

import { createAuthClient } from "better-auth/react";

/**
 * Resolve the auth base URL.
 *   1. NEXT_PUBLIC_BETTER_AUTH_URL if set (build-time) — must be the
 *      Next.js server origin where /api/auth lives.
 *   2. Otherwise window.location.origin in the browser (always absolute).
 *   3. Otherwise a localhost placeholder for SSR/build-time.
 */
function resolveAuthBaseURL(): string {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://127.0.0.1:3002";
}

const baseURL = resolveAuthBaseURL();

export const authClient = createAuthClient({
  baseURL,

  /** Session management — cookie-based, no polling */
  sessionOptions: {
    refetchInterval: 0,
    refetchOnWindowFocus: true,
    refetchWhenOffline: false,
  },

  /** Include credentials for httpOnly cookies */
  fetchOptions: {
    credentials: "include",
  },
});

export type AuthClient = typeof authClient;
