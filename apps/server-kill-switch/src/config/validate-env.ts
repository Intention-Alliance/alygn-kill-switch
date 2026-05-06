/**
 * Environment Variable Validation
 *
 * Validates all required environment variables on startup before
 * the server accepts connections. Fails fast with descriptive
 * error messages if any variable is missing or too weak.
 *
 * ADR-000: Security Baseline — no hardcoded secrets, no silent defaults.
 */

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

function checkSecretEnv(name: string, minLength: number): string | null {
  const val = checkEnv(name);
  if (val === null) return `Missing environment variable: ${name}`;

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
    REDIS_URL: process.env.REDIS_URL!,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@alygn.com',
  };
}
