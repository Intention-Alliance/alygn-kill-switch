/**
 * Better-Auth v1 Configuration with Drizzle SQLite Adapter
 *
 * Refactored from custom sqliteAdapter (memory wrapper) to native
 * drizzleAdapter from Better-Auth. This removes the fragile in-memory
 * persistence layer and lets Better-Auth talk directly to SQLite via Drizzle.
 *
 * Uses Bun.password for password hashing (Argon2id via bun built-in).
 *
 * Architecture:
 *   - drizzleAdapter → Drizzle ORM → bun:sqlite → disk (WAL mode)
 *   - Sessions survive container restarts natively (no more memory layer)
 *   - No custom sqlite-adapter.ts import needed
 *
 * SECURITY: BETTER_AUTH_SECRET validated on import. Process exits
 * if BETTER_AUTH_SECRET is missing.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index';
import * as schema from '../db/schema';

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
  database: drizzleAdapter(db, {
    provider: 'sqlite',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: false,
    password: {
      hash: (input: string) => Bun.password.hash(input),
      verify: ({ password, hash }) => Bun.password.verify(password, hash),
    },
  },
  session: {
    expiresIn: 60 * 60,          // 1 hour
    updateAge: 5 * 60,           // refresh every 5 minutes
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'admin',
        output: true,
        input: false,
      },
    },
  },
  trustedOrigins: (process.env.TRUSTED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://alygn-kill-switch:3000,http://alygn-web-regulator:3000,http://localhost:3001,https://andlersrv.tail62d797.ts.net:8443')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});

// ─── Constants ───────────────────────────────────────────────────────────

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@alygn.com';

// ─── Auto-Seed Admin User ────────────────────────────────────────────────

/**
 * Seeds the default admin user on startup.
 * Uses Better-Auth's native signUpEmail API which respects the configured
 * Bun.password hashing (Argon2id). Password comes from KILL_SWITCH_AUTH_TOKEN
 * env var (same as before for backward compatibility).
 */
export async function seedAdminUser() {
  const email = ADMIN_EMAIL;
  const password = process.env.KILL_SWITCH_AUTH_TOKEN;

  if (!password || password.length < 16) {
    console.warn(
      `[auth] KILL_SWITCH_AUTH_TOKEN is missing or too short (<16 chars). ` +
      `Admin user will NOT be seeded. Set KILL_SWITCH_AUTH_TOKEN in environment.`
    );
    return;
  }

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

  // Create admin user via Better-Auth (uses Bun.password hashing internally)
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
