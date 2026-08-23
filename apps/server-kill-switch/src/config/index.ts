// Configuration loader — environment detection, env var overrides, validation
// Single source of truth for all app configuration

import { AppConfigSchema, type AppConfig } from './schema';
import { developmentConfig } from './environments/development';
import { stagingConfig } from './environments/staging';
import { productionConfig } from './environments/production';

type Environment = 'development' | 'staging' | 'production';

const ENVIRONMENT_DEFAULTS: Record<Environment, Partial<AppConfig>> = {
  development: developmentConfig,
  staging: stagingConfig,
  production: productionConfig,
};

/**
 * Detect current environment from NODE_ENV or KILL_SWITCH_ENV.
 * Falls back to 'development' for safety.
 */
export function detectEnvironment(): Environment {
  const raw = process.env.KILL_SWITCH_ENV || process.env.NODE_ENV || 'development';
  if (raw === 'production') return 'production';
  if (raw === 'staging') return 'staging';
  return 'development';
}

/**
 * Deep merge two objects. `overrides` takes precedence.
 * Only handles plain objects (not arrays, dates, etc).
 */
function deepMerge<T extends Record<string, any>>(base: T, overrides: Partial<T>): T {
  const result = { ...base } as Record<string, any>;
  for (const key of Object.keys(overrides)) {
    const baseVal = result[key];
    const overVal = (overrides as Record<string, any>)[key];
    if (
      baseVal && overVal &&
      typeof baseVal === 'object' && typeof overVal === 'object' &&
      !Array.isArray(baseVal) && !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(baseVal, overVal);
    } else {
      result[key] = overVal;
    }
  }
  return result as T;
}

/**
 * Build environment variable overrides.
 * These take precedence over environment defaults.
 */
function buildEnvOverrides(): Partial<AppConfig> {
  const env = process.env;
  const overrides: Partial<AppConfig> = {} as any;

  // Server
  if (env.KILL_SWITCH_PORT) {
    (overrides as any).server = { ...((overrides as any).server || {}), port: parseInt(env.KILL_SWITCH_PORT, 10) };
  }

  // Redis
  if (env.REDIS_URLS) {
    (overrides as any).redis = {
      ...((overrides as any).redis || {}),
      urls: env.REDIS_URLS.split(',').map((u) => u.trim()),
    };
  }
  if (env.REDIS_PASSWORD) {
    (overrides as any).redis = { ...((overrides as any).redis || {}), password: env.REDIS_PASSWORD };
  }

  // Auth
  if (env.ADMIN_EMAIL) {
    (overrides as any).auth = { ...((overrides as any).auth || {}), adminEmail: env.ADMIN_EMAIL };
  }

  // Logging
  if (env.LOG_LEVEL) {
    (overrides as any).logging = { ...((overrides as any).logging || {}), level: env.LOG_LEVEL as any };
  }

  // Telemetry
  if (env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    (overrides as any).telemetry = { ...((overrides as any).telemetry || {}), endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT };
  }
  if (env.OTEL_SERVICE_NAME) {
    (overrides as any).telemetry = { ...((overrides as any).telemetry || {}), serviceName: env.OTEL_SERVICE_NAME };
  }

  // WebAuthn (ADR-136)
  const webauthnOverrides: Partial<AppConfig['webauthn']> = {};
  if (env.WEBAUTHN_RP_NAME) webauthnOverrides.rpName = env.WEBAUTHN_RP_NAME;
  if (env.WEBAUTHN_RP_ID) webauthnOverrides.rpID = env.WEBAUTHN_RP_ID;
  if (env.WEBAUTHN_ORIGIN) webauthnOverrides.origin = env.WEBAUTHN_ORIGIN;
  if (Object.keys(webauthnOverrides).length > 0) {
    (overrides as Record<string, unknown>).webauthn = {
      ...((overrides as Record<string, unknown>).webauthn as Record<string, unknown> | undefined),
      ...webauthnOverrides,
    };
  }

  // Inference verification (KILL-SWITCH-INFERENCE-VERIFICATION-SPEC §c.2)
  const verificationOverrides: Partial<AppConfig['verification']> = {};
  if (env.KILL_SWITCH_VERIFY_ENABLED) {
    verificationOverrides.verifyEnabled = env.KILL_SWITCH_VERIFY_ENABLED === 'true';
  }
  if (env.KILL_SWITCH_VERIFIER_MODEL) verificationOverrides.verifierModel = env.KILL_SWITCH_VERIFIER_MODEL;
  if (env.KILL_SWITCH_VERIFIER_BASE_URL) verificationOverrides.verifierBaseUrl = env.KILL_SWITCH_VERIFIER_BASE_URL;
  if (env.KILL_SWITCH_VERIFIER_TIMEOUT_MS) {
    verificationOverrides.verifierTimeoutMs = parseInt(env.KILL_SWITCH_VERIFIER_TIMEOUT_MS, 10);
  }
  if (env.KILL_SWITCH_VERIFY_MODE) {
    verificationOverrides.verifyMode = env.KILL_SWITCH_VERIFY_MODE === 'sync' ? 'sync' : 'async';
  }
  if (Object.keys(verificationOverrides).length > 0) {
    (overrides as Record<string, unknown>).verification = {
      ...((overrides as Record<string, unknown>).verification as Record<string, unknown> | undefined),
      ...verificationOverrides,
    };
  }

  return overrides;
}

/**
 * Load and validate application configuration.
 *
 * Priority (highest wins):
 * 1. Environment variables (KILL_SWITCH_*, REDIS_*, etc.)
 * 2. Environment defaults (development/staging/production)
 * 3. Schema defaults (from Zod .default() calls)
 *
 * @throws ZodError if configuration is invalid
 */
export function loadConfig(envOverride?: Environment): AppConfig {
  const environment = envOverride || detectEnvironment();
  const defaults = ENVIRONMENT_DEFAULTS[environment];
  const envOverrides = buildEnvOverrides();

  // Start with environment defaults, then layer env var overrides
  const merged = deepMerge(
    { env: environment, ...defaults } as Partial<AppConfig>,
    envOverrides,
  );

  // Validate with Zod — applies schema defaults for any missing fields
  const result = AppConfigSchema.parse(merged);

  // Ensure env field matches detected environment
  result.env = environment;

  return result;
}

/**
 * Singleton config instance — loaded once on first access.
 * Use this throughout the app instead of process.env.
 */
let _config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/**
 * Reset config singleton — useful for testing.
 */
export function resetConfig(): void {
  _config = null;
}

/**
 * Get current environment name.
 */
export function getEnvironment(): Environment {
  return getConfig().env;
}

/**
 * Check if running in production.
 */
export function isProduction(): boolean {
  return getConfig().env === 'production';
}

/**
 * Check if running in development.
 */
export function isDevelopment(): boolean {
  return getConfig().env === 'development';
}

/**
 * Check a feature flag.
 */
export function isFeatureEnabled(flag: keyof AppConfig['features']): boolean {
  return getConfig().features[flag];
}