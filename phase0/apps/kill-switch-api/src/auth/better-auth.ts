/**
 * Better-Auth Configuration for Kill Switch API
 *
 * Session-based admin authentication replacing custom token comparison.
 * Uses built-in memory adapter (auto when no database configured).
 * Session cookies: HttpOnly, SameSite=Strict.
 */

import { betterAuth } from 'better-auth/minimal';
import { memoryAdapter } from '@better-auth/memory-adapter';

const BASE_PATH = '/v1/auth';

// Persistent memory adapter (stores in module memory, survives multiple requests)
const memAdapter = memoryAdapter();

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
  basePath: BASE_PATH,
  secret: process.env.BETTER_AUTH_SECRET || 'kill-switch-secret-key-32-chars-min!!',
  database: memAdapter,
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60,          // 1 hour
    updateAge: 5 * 60,           // refresh every 5 min
  },
  emailVerification: { enabled: false },
  twoFactor: { enabled: false },
  passkey: { enabled: false },
});

// ─── Constants ─────────────────────────────────────────────────────

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@alygn.com';
export const ADMIN_PASSWORD = process.env.KILL_SWITCH_AUTH_TOKEN || 'andlersrv-auth-token-2026';

// ─── Note on User Management ─────────────────────────────────────
// Users are managed by better-auth internally.
// For initial admin setup, use the /v1/auth/sign-up/email endpoint once,
// or keep the existing custom auth as a fallback.
// Manual seeding removed - memory adapter doesn't support direct adapter writes.

export { BASE_PATH };
