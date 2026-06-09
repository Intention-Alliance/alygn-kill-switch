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

/**
 * Resolve the auth base URL.
 *
 * Better-Auth requires an absolute URL with http:// or https:// protocol.
 * We resolve it at MODULE LOAD time:
 *   1. If NEXT_PUBLIC_BETTER_AUTH_URL is set (build-time, e.g. via .env.local),
 *      use it. This must be the Next.js server origin (where the /api/auth
 *      rewrite lives), NOT the backend origin. e.g. http://localhost:3001 in
 *      dev or https://your-host.com in prod.
 *   2. Otherwise, in the browser, use window.location.origin (always absolute).
 *   3. Otherwise (SSR/build-time fallback), use http://localhost:3000 as a
 *      last-resort placeholder — only the type matters for prerender; the
 *      actual URL is consumed client-side at runtime.
 *
 * v1.1.1 dev-env-unlock: in local dev, set NEXT_PUBLIC_BETTER_AUTH_URL
 * to the Next.js server origin (e.g. http://localhost:3001). The /api/auth
 * path is added by Better-Auth automatically via withPath() and goes
 * through the Next.js rewrite to the backend.
 */
function resolveAuthBaseURL(): string {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_URL) {
    return process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  // SSR/build-time fallback — placeholder, only the protocol matters here
  return "http://localhost:3000";
}

const baseURL = resolveAuthBaseURL();

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
