/**
 * ProviderProfiles
 * Pre-configured rate limit profiles for common email providers
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ProviderRateProfile {
  /** Unique profile identifier */
  id: string;
  /** Display name */
  name: string;
  /** Max emails per hour (token bucket refill rate) */
  emailsPerHour: number;
  /** Max emails per day (absolute ceiling) */
  emailsPerDay: number;
  /** Burst capacity — how many can fire instantly (token bucket size) */
  burstSize: number;
  /** Refill interval in ms — tokens added per tick */
  refillIntervalMs: number;
  /** Tokens added per refill tick */
  refillAmount: number;
  /** Per-domain limits */
  perDomain: {
    /** Max emails to a single domain per minute */
    perMinute: number;
    /** Max emails to a single domain per hour */
    perHour: number;
  };
  /** Warmup schedule: day → daily limit (null = full capacity) */
  warmupSchedule: Record<number, number>;
}

// ── Built-in profiles ──────────────────────────────────────────────────

export const SENDGRID_PROFILE: ProviderRateProfile = {
  id: 'sendgrid',
  name: 'SendGrid',
  emailsPerHour: 500,
  emailsPerDay: 1000,
  burstSize: 10,
  refillIntervalMs: 60_000,   // 1 minute
  refillAmount: 50,           // 50 emails/minute at full capacity
  perDomain: {
    perMinute: 5,
    perHour: 30,
  },
  warmupSchedule: {
    1: 20,
    2: 40,
    3: 60,
    4: 80,
    5: 100,
    6: 150,
    7: 200,
    8: 250,
    9: 300,
    10: 350,
    14: 500,
    21: 750,
    30: 1000,
  },
};

export const SMTP_PROFILE: ProviderRateProfile = {
  id: 'smtp',
  name: 'SMTP (Generic)',
  emailsPerHour: 20,
  emailsPerDay: 500,
  burstSize: 5,
  refillIntervalMs: 60_000,
  refillAmount: 20,           // 20/hour → ~0.33/min, round up for burst
  perDomain: {
    perMinute: 3,
    perHour: 15,
  },
  warmupSchedule: {
    1: 10,
    3: 30,
    7: 100,
    14: 300,
    30: 500,
  },
};

export const SMARTLEAD_PROFILE: ProviderRateProfile = {
  id: 'smartlead',
  name: 'Smartlead',
  emailsPerHour: 200,
  emailsPerDay: 500,
  burstSize: 8,
  refillIntervalMs: 60_000,
  refillAmount: 30,
  perDomain: {
    perMinute: 4,
    perHour: 25,
  },
  warmupSchedule: {
    1: 15,
    3: 50,
    7: 150,
    14: 300,
    30: 500,
  },
};

// ── Registry ───────────────────────────────────────────────────────────

const BUILTIN_PROFILES: Record<string, ProviderRateProfile> = {
  sendgrid: SENDGRID_PROFILE,
  smtp: SMTP_PROFILE,
  smartlead: SMARTLEAD_PROFILE,
};

/**
 * Get a provider profile by ID.
 * Falls back to SMTP if not found.
 */
export function getProviderProfile(id: string): ProviderRateProfile {
  return BUILTIN_PROFILES[id] ?? SMTP_PROFILE;
}

/**
 * Register a custom provider profile (overrides built-in if same ID).
 */
export function registerProfile(profile: ProviderRateProfile): void {
  BUILTIN_PROFILES[profile.id] = profile;
}

/**
 * List all registered profile IDs.
 */
export function listProfiles(): string[] {
  return Object.keys(BUILTIN_PROFILES);
}

export default {
  SENDGRID_PROFILE,
  SMTP_PROFILE,
  SMARTLEAD_PROFILE,
  getProviderProfile,
  registerProfile,
  listProfiles,
};