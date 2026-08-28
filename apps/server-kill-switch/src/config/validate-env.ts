/**
 * Environment Variable Validation
 *
 * Validates all required environment variables on startup before
 * the server accepts connections. Fails fast with descriptive
 * error messages if any variable is missing or too weak.
 *
 * ADR-000: Security Baseline — no hardcoded secrets, no silent defaults.
 */

import type { OllamaProxyConfig, VerificationConfig } from './schema'

// ─── Validation Helpers ──────────────────────────────────────────

interface EnvCheck {
  name: string;
  minLength: number;
  description: string;
}

class EnvValidationError extends Error {
  failures: string[];
  constructor(failures: string[]) {
    const message = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  ENVIRONMENT VALIDATION FAILED`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ...failures.map((f) => `  ❌ ${f}`),
      ``,
      `  Copy .env.example to .env and generate secrets with:`,
      `  bash scripts/security/generate-secrets.sh`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].join('\n');
    super(message);
    this.name = 'EnvValidationError';
    this.failures = failures;
  }
}

function checkEnv(name: string): string | null {
  const val = process.env[name];
  if (!val || val.trim().length === 0) {
    return `Missing environment variable: ${name}`;
  }
  return val.trim();
}

/**
 * Placeholder markers that must never reach production.
 * .env.example ships with these so devs know what to generate.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^change/i, // 'change-me', 'changeme', 'change-this' …
  /^<generate-with-/, // .env.example: <generate-with-openssl-rand-base64-64>
  /^<.*>$/, // any angle-bracket placeholder
  /^your[-_ ]/i, // 'your-secret-here', 'your_api_key'
  /^example[-_ ]/i, // 'example-secret'
];

function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

function checkSecretEnv(name: string, minLength: number): string | null {
  const val = checkEnv(name);
  if (val === null) return `Missing environment variable: ${name}`;

  if (isPlaceholder(val)) {
    return `${name} is still a placeholder value ("${val.slice(0, 24)}…"). Generate a strong secret — never run with .env.example defaults.`;
  }

  if (val.length < minLength) {
    return `${name} is too short (${val.length} chars). Minimum: ${minLength} chars. Generate a strong secret.`;
  }

  // Complexity check: must contain at least 2 character classes
  const hasLower = /[a-z]/.test(val);
  const hasUpper = /[A-Z]/.test(val);
  const hasDigit = /[0-9]/.test(val);
  const hasSpecial = /[^a-zA-Z0-9]/.test(val);
  const classCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

  if (classCount < 2) {
    return `${name} is too simple — must contain at least 2 character types (lowercase, uppercase, digit, special).`;
  }

  return null;
}

// ─── Required Environment Variables ──────────────────────────────

const REQUIRED_ENV = {
  BETTER_AUTH_SECRET: {
    minLength: 32,
    description: 'Better Auth session signing secret (used to encrypt session cookies)',
  },
  KILL_SWITCH_AUTH_TOKEN: {
    minLength: 16,
    description: 'Admin login password for kill switch dashboard',
  },
  REDIS_URL: {
    minLength: 1,
    description: 'Redis connection URL (e.g. redis://localhost:6379)',
  },
  KILL_SWITCH_API_KEY: {
    minLength: 16,
    description: 'API key for kill switch chaos operations',
  },
  ADMIN_UI_API_KEY: {
    minLength: 32,
    description: 'Bearer token for /api/admin/secrets/* endpoints (rotate, view, audit)',
  },
  KILL_SWITCH_INTERNAL_KEY: {
    minLength: 32,
    description: 'Shared secret for /v1/internal/api-keys/* (the openclaw-webhook uses this to look up keys)',
  },
  AUDIT_HMAC_KEY: {
    minLength: 32,
    description: 'Server-side HMAC key for the immutable audit chain (ADR-140 §6.2 — must NOT live in the SQLite file)',
  },
} as const;

// ─── Validation ──────────────────────────────────────────────────

/**
 * Validate all required environment variables exist and meet security requirements.
 * Throws EnvValidationError with all failures listed if any check fails.
 */
export function validateEnvironment(): void {
  const failures: string[] = [];

  // Check secrets with complexity requirements
  const secrets: EnvCheck[] = [
    { name: 'BETTER_AUTH_SECRET', minLength: 32, description: REQUIRED_ENV.BETTER_AUTH_SECRET.description },
    { name: 'KILL_SWITCH_AUTH_TOKEN', minLength: 16, description: REQUIRED_ENV.KILL_SWITCH_AUTH_TOKEN.description },
    { name: 'KILL_SWITCH_API_KEY', minLength: 16, description: REQUIRED_ENV.KILL_SWITCH_API_KEY.description },
    { name: 'ADMIN_UI_API_KEY', minLength: 32, description: REQUIRED_ENV.ADMIN_UI_API_KEY.description },
    { name: 'KILL_SWITCH_INTERNAL_KEY', minLength: 32, description: REQUIRED_ENV.KILL_SWITCH_INTERNAL_KEY.description },
    { name: 'AUDIT_HMAC_KEY', minLength: 32, description: REQUIRED_ENV.AUDIT_HMAC_KEY.description },
  ];

  for (const secret of secrets) {
    const error = checkSecretEnv(secret.name, secret.minLength);
    if (error) failures.push(`${error} — ${secret.description}`);
  }

  // Check REDIS_URL (no complexity check, just existence)
  const redisVal = process.env.REDIS_URL?.trim();
  if (!redisVal) {
    failures.push(`Missing environment variable: REDIS_URL — ${REQUIRED_ENV.REDIS_URL.description}`);
  }

  if (failures.length > 0) {
    throw new EnvValidationError(failures);
  }

  console.log('✅ Environment variables validated successfully');
}

/**
 * Validate environment and return the validated values as a typed object.
 * Use this when you need the validated values directly.
 */
export function validateAndGetEnv() {
  validateEnvironment();
  return {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET!,
    KILL_SWITCH_AUTH_TOKEN: process.env.KILL_SWITCH_AUTH_TOKEN!,
    KILL_SWITCH_API_KEY: process.env.KILL_SWITCH_API_KEY!,
    ADMIN_UI_API_KEY: process.env.ADMIN_UI_API_KEY!,
    KILL_SWITCH_INTERNAL_KEY: process.env.KILL_SWITCH_INTERNAL_KEY!,
    AUDIT_HMAC_KEY: process.env.AUDIT_HMAC_KEY!,
    REDIS_URL: process.env.REDIS_URL!,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@alygn.com',
  };
}

// ─── Verifier Config Validation (ADR-2026-08-23) ─────────────────

/**
 * Validate the inference verifier configuration.
 *
 * When `verifyEnabled` is true, the verifier model must be non-empty and the
 * verifier base URL must be a valid, reachable endpoint. This fails fast at
 * startup so the server never boots with a broken verifier while claiming
 * verification is active.
 *
 * When `verifyEnabled` is false (the safe default), validation is a no-op —
 * the system behaves exactly as today.
 *
 * @throws Error with a descriptive message if the verifier config is invalid.
 */
export function validateVerifierConfig(verification: VerificationConfig): void {
  if (!verification.verifyEnabled) {
    return;
  }

  const failures: string[] = [];

  if (!verification.verifierModel || verification.verifierModel.trim().length === 0) {
    failures.push('verifierModel must be non-empty when verification is enabled');
  }

  // Validate the base URL is a well-formed http(s) URL.
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(verification.verifierBaseUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      failures.push(`verifierBaseUrl must use http(s), got "${parsedUrl.protocol}"`);
    }
  } catch {
    failures.push(`verifierBaseUrl is not a valid URL: "${verification.verifierBaseUrl}"`);
  }

  if (failures.length > 0) {
    throw new Error(
      `Verifier configuration invalid:\n  - ${failures.join('\n  - ')}`,
    );
  }

  // Reachability check is async (network call) — see validateVerifierReachability.
  void parsedUrl;
}

/**
 * Asynchronously check that the verifier model endpoint is reachable.
 *
 * Probes the Ollama (or OpenAI-compatible) `/api/tags` endpoint at the
 * configured base URL. Returns true if reachable, false otherwise. This is
 * intentionally non-throwing so a transient network blip during startup does
 * not crash the server — the caller decides how to handle an unreachable
 * verifier (e.g. log a degraded-verification warning).
 */
export async function validateVerifierReachability(
  verification: VerificationConfig,
  timeoutMs = 2_000,
): Promise<boolean> {
  if (!verification.verifyEnabled) {
    return true;
  }

  try {
    const base = verification.verifierBaseUrl.replace(/\/$/, '');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}/api/tags`, {
        signal: controller.signal,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

// ─── Ollama Proxy Config Validation (infra consult #3) ────────────

/**
 * Validate the Ollama reverse-proxy upstream list.
 *
 * Each upstream must be a well-formed http(s) URL. The list is ordered —
 * first entry is the primary, the rest are failover candidates. This is a
 * no-op when the list is empty (the schema default always provides at least
 * one entry, so this only fires on explicit misconfiguration).
 *
 * @throws Error with a descriptive message if any upstream is invalid.
 */
export function validateOllamaProxyConfig(proxy: OllamaProxyConfig): void {
  const failures: string[] = [];

  if (!proxy.upstreams || proxy.upstreams.length === 0) {
    failures.push('upstreams must contain at least one upstream URL');
  }

  for (const upstream of proxy.upstreams ?? []) {
    try {
      const parsed = new URL(upstream);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        failures.push(`upstream "${upstream}" must use http(s), got "${parsed.protocol}"`);
      }
    } catch {
      failures.push(`upstream is not a valid URL: "${upstream}"`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Ollama proxy configuration invalid:\n  - ${failures.join('\n  - ')}`,
    );
  }
}
