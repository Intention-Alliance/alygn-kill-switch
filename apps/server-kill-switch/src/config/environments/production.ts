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
    // Verification is enabled in production: the verifier model (qwen2.5:0.5b)
    // is confirmed reachable at the production Ollama endpoint, and the
    // inference-verification layer is active (see verification block below).
    killSwitchVerificationEnabled: true,
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
    challengeTtlMs: 300_000,
    assertionTokenTtlMs: 600_000,
  },
  // ADR-2026-08-23: inference verification is ACTIVE in production. The
  // verifier model (qwen2.5:0.5b) is confirmed reachable at the production
  // Ollama endpoint (host.docker.internal:11434 via the host-gateway alias).
  // Both killSwitchVerificationEnabled (above) and verifyEnabled must be true
  // for the verifier to activate; KILL_SWITCH_VERIFY_ENABLED=true in .env
  // overrides this to true at runtime.
  verification: {
    verifierModel: 'qwen2.5:0.5b',
    verifierBaseUrl: 'http://localhost:11434',
    verifierTimeoutMs: 500,
    verifyEnabled: true,
    verifyMode: 'async',
    verifierSystemPromptPath: 'docs/specs/verifier-system-prompt.md',
    // Future trained LoRA adapter. Until it's created, the verifier runs on
    // verifierModel (qwen2.5:0.5b). Once trained, set verifierModel to this.
    verifierTargetModel: 'dignity-verification-v0.1-preview',
  },
};