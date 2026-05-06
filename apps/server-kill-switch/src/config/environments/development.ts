// Development environment defaults — permissive, debug-friendly

import type { AppConfig } from '../schema';

export const developmentConfig: Partial<AppConfig> = {
  redis: {
    urls: ['redis://localhost:6379'],
    password: '',
    poolSize: 5,
    connectTimeoutMs: 30_000,
    commandTimeoutMs: 10_000,
    retryStrategy: 'exponential',
    maxRetries: 5,
  },
  rateLimit: {
    generalMaxRequests: 100,
    generalWindowMs: 60_000,
    authMaxAttempts: 20,
    authWindowMs: 900_000,
  },
  auth: {
    tokenExpiryMs: 86_400_000, // 24h in dev
    cookieSecure: false,
    cookieSameSite: 'Strict',
    adminEmail: 'admin@alygn.com',
  },
  logging: {
    level: 'debug',
    format: 'pretty',
    includeTimestamp: true,
    redactSecrets: false,
  },
  features: {
    enableChaosEngineering: true,
    enableOpenTelemetry: false,
    enableAuditLog: true,
    enableCostTracking: true,
    enableResourceMonitor: true,
    enableIncidentResponse: true,
    enableLbHealth: true,
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    shutdownTimeoutMs: 5_000,
  },
  telemetry: {
    enabled: false,
    endpoint: 'http://localhost:4317',
    serviceName: 'kill-switch-api-dev',
    sampleRate: 1.0,
  },
};