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
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL || "/api/auth";

// v1.1.1 dev-env-unlock: warn (not fail) if the auth client is pointed at a
// non-localhost URL without a same-origin proxy. CSP 'self' will block the
// getSession fetch, and login will silently fail in the browser.
if (baseURL.startsWith("http") && !baseURL.includes("localhost") && !baseURL.includes("127.0.0.1")) {
  // eslint-disable-next-line no-console
  console.warn(
    `[auth-client] NEXT_PUBLIC_BETTER_AUTH_URL=${baseURL} is a non-localhost absolute URL. ` +
    `If your CSP connect-src is 'self', the getSession fetch will be blocked. ` +
    `Use the relative '/api/auth' (Next.js rewrite → backend) unless you have nginx ` +
    `or another reverse proxy serving the API on the same origin.`
  );
}

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
