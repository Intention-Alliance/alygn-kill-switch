/**
 * Better-Auth Client Configuration
 *
 * Coupling point with kill-switch-api better-auth server.
 *
 * ============================================
 * PREREQUISITES — Verify with Keridz when backend is ready:
 * ============================================
 *
 * 1. The kill-switch-api must embed a better-auth server
 * 2. The better-auth server must mount at basePath: "/v1/auth"
 *    (Example server config:)
 *    ```
 *    const auth = betterAuth({
 *      basePath: "/v1/auth",
 *      // ...
 *    });
 *    ```
 * 3. Nginx already proxies /v1/auth/* → kill-switch-api (port 3000)
 *    No nginx config changes needed — the existing setup works.
 *
 * Server endpoint paths (automatically handled by better-auth):
 * - POST /v1/auth/sign-in/email
 * - POST /v1/auth/sign-out
 * - GET  /v1/auth/get-session
 *
 * ============================================
 * Dev vs Prod routing:
 * ============================================
 * - Dev:  Vite proxy (vite.config.ts) sends /v1 → 127.0.0.1:3000
 *         So we use baseURL: "http://127.0.0.1:3000/v1/auth"
 * - Prod: Nginx proxies /v1/auth/ → kill_switch_api
 *         So we use baseURL: "/v1/auth" (relative to origin)
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  /** Base URL for better-auth server endpoints */
  baseURL: import.meta.env.DEV
    ? "http://127.0.0.1:3000/v1/auth"
    : "/v1/auth",

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
