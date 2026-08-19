// Production environment — hardened defaults, strict limits

import type { AppConfig } from '../schema';

export const productionConfig: Partial<AppConfig> = {
  redis: {
    urls: ['redis://redis:6379'],
    password: '',
    poolSize: 20,
    connectTimeoutMs: 10_000,
    commandTimeoutMs: 3_000,
    retryStrategy: 'exponential',
    maxRetries: 3,
  },
  rateLimit: {
    generalMaxRequests: 10,
    generalWindowMs: 60_000,
    authMaxAttempts: 5,
    authWindowMs: 900_000,
  },
  auth: {
    tokenExpiryMs: 3_600_000, // 1h
    cookieSecure: true,
    cookieSameSite: 'Strict',
    adminEmail: 'admin@alygn.com',
  },
  logging: {
    level: 'info',
    format: 'json',
    includeTimestamp: true,
    redactSecrets: true,
  },
  features: {
    enableChaosEngineering: false,
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
    shutdownTimeoutMs: 30_000,
  },
  telemetry: {
    enabled: true,
    endpoint: 'http://otel-collector:4317',
    serviceName: 'kill-switch-api',
    sampleRate: 0.1,
  },
  // ADR-136: WebAuthn (FIDO2) — production relying party binds to the
  // Tailscale mesh hostname + Nginx SSL listener. Overridable via the
  // WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN env vars (see config/index.ts).
  webauthn: {
    rpName: 'Alygn Kill Switch',
    rpID: 'andlersrv.tail62d797.ts.net',
    origin: 'https://andlersrv.tail62d797.ts.net:8443',
  },
};