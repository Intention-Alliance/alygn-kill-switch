// Configuration schema — Zod validation for all config values
// Ensures type safety and fails fast on invalid configuration

import { z } from 'zod';

export const RedisConfigSchema = z.object({
  urls: z.array(z.string().url()).min(1),
  password: z.string().optional().default(''),
  poolSize: z.number().int().min(1).max(100).default(10),
  connectTimeoutMs: z.number().int().min(100).default(10_000),
  commandTimeoutMs: z.number().int().min(100).default(5_000),
  retryStrategy: z.enum(['exponential', 'fixed', 'none']).default('exponential'),
  maxRetries: z.number().int().min(0).max(20).default(3),
});

export const RateLimitConfigSchema = z.object({
  generalMaxRequests: z.number().int().min(1).default(10),
  generalWindowMs: z.number().int().min(1000).default(60_000),
  authMaxAttempts: z.number().int().min(1).default(5),
  authWindowMs: z.number().int().min(1000).default(900_000),
});

export const AuthConfigSchema = z.object({
  tokenExpiryMs: z.number().int().min(60_000).default(3_600_000),
  cookieSecure: z.boolean().default(false),
  cookieSameSite: z.enum(['Strict', 'Lax', 'None']).default('Strict'),
  adminEmail: z.string().email().default('admin@alygn.com'),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  format: z.enum(['json', 'pretty']).default('json'),
  includeTimestamp: z.boolean().default(true),
  redactSecrets: z.boolean().default(true),
});

export const FeatureFlagsSchema = z.object({
  enableChaosEngineering: z.boolean().default(true),
  enableOpenTelemetry: z.boolean().default(true),
  enableAuditLog: z.boolean().default(true),
  enableCostTracking: z.boolean().default(false),
  enableResourceMonitor: z.boolean().default(false),
  enableIncidentResponse: z.boolean().default(false),
  enableLbHealth: z.boolean().default(true),
});

export const ServerConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  shutdownTimeoutMs: z.number().int().min(1000).default(30_000),
});

export const TelemetryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  endpoint: z.string().default('http://otel-collector:4317'),
  serviceName: z.string().default('kill-switch-api'),
  sampleRate: z.number().min(0).max(1).default(1.0),
});

// ADR-136: WebAuthn (FIDO2) relying-party configuration for
// human-signature kill authorization. rpID must be the effective
// domain (no scheme), origin the full https origin the authenticator
// binds assertions to.
export const WebAuthnConfigSchema = z.object({
  rpName: z.string().min(1).default('Alygn Kill Switch'),
  rpID: z.string().min(1).default('localhost'),
  origin: z.string().min(1).default('http://localhost:3000'),
  challengeTtlMs: z.number().int().min(1000).default(300_000),
  assertionTokenTtlMs: z.number().int().min(1000).default(120_000),
});

export const AppConfigSchema = z.object({
  env: z.enum(['development', 'staging', 'production']),
  redis: RedisConfigSchema,
  rateLimit: RateLimitConfigSchema,
  auth: AuthConfigSchema,
  logging: LoggingConfigSchema,
  features: FeatureFlagsSchema,
  server: ServerConfigSchema,
  telemetry: TelemetryConfigSchema,
  webauthn: WebAuthnConfigSchema.default({}),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;
export type WebAuthnConfig = z.infer<typeof WebAuthnConfigSchema>;