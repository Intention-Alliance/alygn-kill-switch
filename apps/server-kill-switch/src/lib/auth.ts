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
import { eq } from 'drizzle-orm';
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
  trustedOrigins: (process.env.TRUSTED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://host.docker.internal:3000,http://alygn-web-regulator:3000,http://localhost:3001,https://andlersrv.tail62d797.ts.net:8443')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
});

// ─── Constants ───────────────────────────────────────────────────────────

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@alygn.com';

// ─── Auto-Seed Admin User ────────────────────────────────────────────────

/**
 * Auto-Seed Admin User (direct DB insert — no HTTP self-roundtrip).
 *
 * FIX (kill-switch startup deadlock): the previous implementation called
 * auth.api.signInEmail()/signUpEmail(), which perform an HTTP roundtrip to
 * BETTER_AUTH_URL (the server's own port). During startup the event loop is
 * blocked before Bun.serve() returns, so that self-request deadlocks forever.
 *
 * This version writes the admin user + credential account DIRECTLY to SQLite
 * via Drizzle ORM — no HTTP involved. It mirrors exactly what Better-Auth's
 * signUpEmail would persist (user row + credential account row with the
 * Argon2id password hash), so sign-in continues to work unchanged.
 *
 * Password comes from KILL_SWITCH_AUTH_TOKEN env var (same as before for
 * backward compatibility). Idempotent: skips if the user already exists.
 */
export async function seedAdminUser() {
  // P2-2: Normalize the admin email to lowercase before insert so lookups and
  // sign-in are case-insensitive-consistent (Better-Auth lowercases on signup).
  const email = ADMIN_EMAIL.toLowerCase();
  const password = process.env.KILL_SWITCH_AUTH_TOKEN;

  if (!password || password.length < 16) {
    console.warn(
      `[auth] KILL_SWITCH_AUTH_TOKEN is missing or too short (< 16 chars). ` +
      `Admin user will NOT be seeded. Set KILL_SWITCH_AUTH_TOKEN in environment.`
    );
    return;
  }

  // Check if the admin user already exists (direct DB query — no HTTP).
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .get();

  if (existing) {
    console.log(`[auth] Admin user "${email}" already exists, skipping seed`);
    return;
  }

  // Create the admin user + credential account directly in SQLite.
  // Mirrors Better-Auth's signUpEmail persistence: a `user` row plus an
  // `account` row with providerId='credential' holding the Argon2id hash.
  const userId = crypto.randomUUID();
  const now = new Date();
  const passwordHash = await Bun.password.hash(password);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.users).values({
        id: userId,
        email,
        // P2-1: emailVerified stays `true` for the seeded admin — the admin is
        // provisioned directly (no email verification flow), unlike signUpEmail
        // which would leave it false pending verification.
        emailVerified: true,
        name: 'Admin',
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(schema.accounts).values({
        id: crypto.randomUUID(),
        userId,
        accountId: userId, // Better-Auth credential accounts key on the user id
        providerId: 'credential',
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    });

    console.log(`[auth] Admin user "${email}" seeded successfully (direct DB insert)`);
  } catch (err: any) {
    // Unique-constraint race (another process seeded first) is non-fatal.
    if (err?.message?.includes('UNIQUE') || err?.message?.includes('already exists')) {
      console.log(`[auth] Admin user "${email}" already exists (race condition), skipping`);
      return;
    }
    console.error(`[auth] Failed to seed admin user: ${err?.message || err}`);
  }
}

export { BASE_PATH };
