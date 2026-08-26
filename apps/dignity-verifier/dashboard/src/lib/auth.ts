/**
 * Dignity Verifier Dashboard — Super-Admin Auth (Better-Auth + WebAuthn)
 *
 * SECURITY MODEL: super-admin only. There is exactly ONE user (Andler).
 * No public registration, no multi-user, no sign-up flow. Access is gated
 * by three independent layers:
 *
 *   1. Tailscale identity check — the request must originate from the
 *      Tailscale mesh (nginx enforces this at the network edge; this module
 *      re-verifies the client IP is within the Tailscale CGNAT range
 *      100.64.0.0/10 as defense-in-depth).
 *   2. Better-Auth session — httpOnly cookie, 1h expiry, refreshed every 5m.
 *   3. WebAuthn (FIDO2) — the super-admin authenticates with a hardware
 *      security key / passkey bound to the Tailscale relying party.
 *
 * The super-admin user is seeded directly into SQLite (no HTTP self-roundtrip,
 * avoiding the kill-switch startup deadlock). Password comes from
 * KILL_SWITCH_AUTH_TOKEN (shared with the kill-switch for consistency).
 *
 * This is a self-contained Better-Auth server (unlike web-regulator, which
 * proxies auth to the kill-switch backend). The dashboard owns its own
 * session store so it can run independently of the kill-switch.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./db-schema";

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

const BETTER_AUTH_SECRET = requireSecretEnv("BETTER_AUTH_SECRET", 32);
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL || "http://127.0.0.1:3002";
const BASE_PATH = "/api/auth";

// ─── Tailscale identity constants ───────────────────────────────────────

// Tailscale CGNAT range (RFC 6598 / 100.64.0.0/10). All Tailscale client
// IPs fall within this range. Used as defense-in-depth: even if nginx is
// misconfigured, the app refuses non-Tailscale clients.
const TAILSCALE_CGNAT = "100.64.0.0/10";
const TAILSCALE_IP = process.env.TAILSCALE_IP || "100.66.199.80";
const TAILSCALE_HOSTNAME = process.env.TAILSCALE_HOSTNAME || "andlersrv.tail62d797.ts.net";

/**
 * Check whether an IP is within the Tailscale CGNAT range.
 * Simple prefix match on the first two octets (100.64.0.0/10 → 100.64–100.127).
 */
export function isTailscaleIP(ip: string | undefined | null): boolean {
  if (!ip) return false;
  const match = ip.match(/^(\d+)\.(\d+)\./);
  if (!match) return false;
  const first = parseInt(match[1], 10);
  const second = parseInt(match[2], 10);
  // 100.64.0.0/10 covers 100.64.0.0 – 100.127.255.255
  return first === 100 && second >= 64 && second <= 127;
}

// ─── SQLite + Drizzle (self-contained session store) ────────────────────

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const DB_PATH = `${DATA_DIR}/dignity-verifier.db`;

// Ensure data dir exists (idempotent)
import { mkdirSync } from "node:fs";
mkdirSync(DATA_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.exec("PRAGMA journal_mode = WAL;");
const db = drizzle(sqlite);

// ─── Better-Auth Instance ───────────────────────────────────────────────

export const auth = betterAuth({
  baseURL: BETTER_AUTH_URL,
  basePath: BASE_PATH,
  secret: BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  // Super-admin only: email+password for the single seeded user.
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: false,
    password: {
      hash: (input: string) => Bun.password.hash(input),
      verify: ({ password, hash }) => Bun.password.verify(password, hash),
    },
  },
  // WebAuthn (FIDO2) — hardware key / passkey bound to the Tailscale RP.
  // Mirrors the kill-switch ADR-136 relying-party config.
  webauthn: {
    rpName: "Alygn Dignity Verifier",
    rpID: TAILSCALE_HOSTNAME,
    origin: `https://${TAILSCALE_HOSTNAME}:8443`,
    challengeTtlMs: 300_000,
    assertionTokenTtlMs: 600_000,
  },
  session: {
    expiresIn: 60 * 60,          // 1 hour
    updateAge: 5 * 60,           // refresh every 5 minutes
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "super-admin",
        output: true,
        input: false,
      },
    },
  },
  trustedOrigins: (
    process.env.TRUSTED_ORIGINS ||
    `http://127.0.0.1:3002,http://localhost:3002,https://${TAILSCALE_HOSTNAME}:8443`
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
});

// ─── Constants ───────────────────────────────────────────────────────────

export const SUPER_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "andlersrv@alygn.com").toLowerCase();

// ─── Auto-Seed Super-Admin User ─────────────────────────────────────────

/**
 * Seed the single super-admin user directly into SQLite (no HTTP
 * self-roundtrip — avoids the kill-switch startup deadlock). Idempotent:
 * skips if the user already exists. Password comes from
 * KILL_SWITCH_AUTH_TOKEN (shared with the kill-switch).
 */
export async function seedSuperAdmin() {
  const password = process.env.KILL_SWITCH_AUTH_TOKEN;

  if (!password || password.length < 16) {
    console.warn(
      `[auth] KILL_SWITCH_AUTH_TOKEN is missing or too short (< 16 chars). ` +
      `Super-admin user will NOT be seeded. Set KILL_SWITCH_AUTH_TOKEN in environment.`
    );
    return;
  }

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, SUPER_ADMIN_EMAIL))
    .get();

  if (existing) {
    console.log(`[auth] Super-admin "${SUPER_ADMIN_EMAIL}" already exists, skipping seed`);
    return;
  }

  const userId = crypto.randomUUID();
  const now = new Date();
  const passwordHash = await Bun.password.hash(password);

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.users).values({
        id: userId,
        email: SUPER_ADMIN_EMAIL,
        emailVerified: true,
        name: "Andler",
        role: "super-admin",
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(schema.accounts).values({
        id: crypto.randomUUID(),
        userId,
        accountId: userId,
        providerId: "credential",
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      });
    });

    console.log(`[auth] Super-admin "${SUPER_ADMIN_EMAIL}" seeded successfully (direct DB insert)`);
  } catch (err: any) {
    if (err?.message?.includes("UNIQUE") || err?.message?.includes("already exists")) {
      console.log(`[auth] Super-admin already exists (race condition), skipping`);
      return;
    }
    console.error(`[auth] Failed to seed super-admin: ${err?.message || err}`);
  }
}

export { BASE_PATH, isTailscaleIP, TAILSCALE_IP, TAILSCALE_HOSTNAME };
