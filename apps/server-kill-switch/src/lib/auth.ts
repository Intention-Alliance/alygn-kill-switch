/**
 * Better-Auth v1 Configuration with SQLite Persistence
 *
 * Upgraded from file adapter (JSON) to SQLite persistence.
 * Uses Bun.password for password hashing (Argon2id via bun built-in).
 *
 * Architecture:
 *   - Loads state from SQLite → in-memory adapter on startup
 *   - Persists every mutation back to SQLite
 *   - Sessions survive container restarts
 *
 * SECURITY: All secrets validated on import. Process exits
 * if BETTER_AUTH_SECRET or KILL_SWITCH_AUTH_TOKEN are missing.
 */

import { betterAuth } from 'better-auth';
import { sqliteAdapter } from './sqlite-adapter';

// ─── Environment Validation ──────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val || val.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val.trim();
}

function requireSecretEnv(name: string, minLength: number): string {
  const val = requireEnv(name);
  if (val.length < minLength) {
    throw new Error(
      `${name} is too short (${val.length} chars). Minimum: ${minLength} chars.`
    );
  }
  return val;
}

const BETTER_AUTH_SECRET = requireSecretEnv('BETTER_AUTH_SECRET', 32);
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
const BASE_PATH = '/v1/auth';

// ─── Better-Auth Instance ────────────────────────────────────────────────

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  basePath: BASE_PATH,
  secret: BETTER_AUTH_SECRET,
  database: sqliteAdapter,
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: false,
  },
  session: {
    expiresIn: 60 * 60,          // 1 hour
    updateAge: 5 * 60,           // refresh every 5 minutes
  },
});

// ─── Constants ───────────────────────────────────────────────────────────

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@alygn.com';
export const ADMIN_PASSWORD = requireSecretEnv('KILL_SWITCH_AUTH_TOKEN', 16);

// ─── Auto-Seed Admin User ────────────────────────────────────────────────

export async function seedAdminUser() {
  const email = ADMIN_EMAIL;
  const password = ADMIN_PASSWORD;

  // Try sign-in first to check if admin exists
  try {
    const signInResult = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    if (signInResult?.user) {
      console.log(`[auth] Admin user "${email}" already exists, skipping seed`);
      return;
    }
  } catch (_signInErr: any) {
    console.log(`[auth] Admin user "${email}" not found, creating...`);
  }

  // Create admin user
  try {
    const result = await auth.api.signUpEmail({
      body: { email, password, name: 'Admin' },
      headers: new Headers({ 'Content-Type': 'application/json' }),
    });

    if (result?.user) {
      console.log(`[auth] Admin user "${email}" seeded successfully`);
    } else {
      console.error('[auth] Admin sign-up returned without user:', result);
    }
  } catch (createErr: any) {
    if (createErr?.message?.includes('already exists') || createErr?.status === 400) {
      console.log(`[auth] Admin user "${email}" already exists (race condition), skipping`);
      return;
    }
    console.error(`[auth] Failed to seed admin user: ${createErr?.message || createErr}`);
  }
}

export { BASE_PATH };
