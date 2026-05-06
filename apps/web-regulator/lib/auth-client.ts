/**
 * Better-Auth Client Configuration
 *
 * Coupling point with server-kill-switch Better-Auth server.
 * The kill-switch API embeds Better-Auth at /v1/auth.
 *
 * Session tokens are stored in httpOnly cookies (not localStorage).
 * CSRF protection via double-submit cookie pattern.
 */

import { createAuthClient } from "better-auth/react";

const baseURL =
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "http://localhost:3000/v1/auth";

export const authClient = createAuthClient({
  baseURL,

  /** Session management options */
  sessionOptions: {
    /** Disable polling — rely on cookie-based sessions */
    refetchInterval: 0,
    /** Re-fetch session on window focus */
    refetchOnWindowFocus: true,
    /** Don't refetch when offline */
    refetchWhenOffline: false,
  },

  /** Fetch options — include credentials for httpOnly cookies */
  fetchOptions: {
    credentials: "include",
  },
});

/** Type helper for the auth client */
export type AuthClient = typeof authClient;
