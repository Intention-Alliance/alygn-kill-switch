// Staging environment — mirrors production but with debug access

import type { AppConfig } from '../schema';

export const stagingConfig: Partial<AppConfig> = {
  redis: {
    urls: ['redis://redis:6379'],
    password: '',
    poolSize: 10,
    connectTimeoutMs: 15_000,
    commandTimeoutMs: 5_000,
    retryStrategy: 'exponential',
    maxRetries: 3,
  },
  rateLimit: {
    generalMaxRequests: 30,
    generalWindowMs: 60_000,
    authMaxAttempts: 10,
    authWindowMs: 900_000,
  },
  auth: {
    tokenExpiryMs: 3_600_000, // 1h
    cookieSecure: true,
    cookieSameSite: 'Strict',
    adminEmail: 'admin@alygn.com',
  },
  logging: {
    level: 'debug',
    format: 'json',
    includeTimestamp: true,
    redactSecrets: true,
  },
  features: {
    enableChaosEngineering: true,
    enableOpenTelemetry: true,
    enableAuditLog: true,
    enableCostTracking: true,
    enableResourceMonitor: true,
    enableIncidentResponse: true,
    enableLbHealth: true,
    killSwitchTrafficPauseEnabled: true,
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
    shutdownTimeoutMs: 15_000,
  },
  telemetry: {
    enabled: true,
    endpoint: 'http://otel-collector:4317',
    serviceName: 'kill-switch-api-staging',
    sampleRate: 1.0,
  },
};