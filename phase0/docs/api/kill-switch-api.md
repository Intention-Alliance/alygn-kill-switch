# Kill Switch API Reference

> Auto-generated on 2026-04-18T03:39:31.418Z

## Overview

The Kill Switch API provides BCP (Business Continuity Planning) and chaos engineering controls.

## Base URL

- Development: `http://localhost:3000`
- Staging: `https://kill-switch.staging.example.com`
- Production: `https://kill-switch.example.com`

## Authentication

Most endpoints require authentication via:
- Cookie: `admin_token` (set by login)
- Bearer token: `Authorization: Bearer <token>`
- API key: `x-api-key: <key>`

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /v1/kill-switch/status | Yes | Current state |
| POST | /v1/kill-switch/chaos | Yes | Transition state |
| GET | /v1/kill-switch/health | No | Health check |
| GET | /v1/kill-switch/activations | Yes | Audit log |
| POST | /v1/auth/login | No | Login |
| POST | /v1/auth/logout | No | Logout |
| GET | /v1/auth/me | No | Session check |
| GET | /v1/auth/ip | No | IP detection |
| GET | /health | No | LB liveness |
| GET | /ready | No | LB readiness |
| GET | /metrics | No | Prometheus metrics |
| GET | /admin/cost | Yes | Cost report |
| GET | /admin/resources | Yes | Resource stats |
| GET | /admin/incidents | Yes | Incident report |
| GET | /admin/runbooks | Yes | Runbook status |

## Source Documentation

### services

- **`export function getResourceStats(): ResourceStats {`**: Get current resource stats.
/
- **`export function checkResourceAlerts(stats: ResourceStats): ResourceAlert[] {`**: Check resource thresholds and return alerts.
/
- **`export function isMemoryCritical(): boolean {`**: Check if system is under memory pressure (for request rejection).
Returns true if memory usage exceeds critical threshold.
/
- **`export function isMemoryWarning(): boolean {`**: Check if system is under memory warning.
/
- **`shouldThrottle(endpoint: string): boolean {`**: Check if an endpoint should be rate-limited based on cost.
Expensive endpoints (high Redis write count) get throttled more aggressively.
/
- **`async detectRedisFailure(service: KillSwitchService): Promise<Incident | null> {`**: Detect Redis failure and activate circuit breaker.
/
- **`detectHighErrorRate(): Incident | null {`**: Detect high error rate and auto-throttle.
/
- **`recordAuthFailure(ip: string): Incident | null {`**: Record auth failure for an IP and detect attacks.
/
- **`detectMemoryPressure(): Incident | null {`**: Detect memory pressure.
/
- **`detectHighLoad(): Incident | null {`**: Detect high load.
/
- **`isIpBlocked(ip: string): boolean {`**: Check if an IP is blocked.
/
- **`isCircuitBreakerOpen(): boolean {`**: Check if circuit breaker is open.
/
- **`getActiveIncidents(): Incident[] {`**: Get all active incidents.
/
- **`getAllIncidents(limit = 50): Incident[] {`**: Get all incidents (including resolved).
/
- **`getBlockedIps(): Array<{ ip: string; reason: string; blockedAt: string; unblockA`**: Get blocked IPs.
/
- **`async runDetection(service: KillSwitchService): Promise<Incident[]> {`**: Run all detection checks.
/

### middleware

- **`function formatPrometheus(metrics: ReturnType<typeof getMetrics>): string {`**: Format metrics in Prometheus exposition format.
/
- **`export function withMetrics(handler: (req: any, res: any) => Promise<void>) {`**: Middleware to track response times and active connections.
Wrap the handler with this to collect metrics.
/
- **`export function resourceCheckMiddleware(req: any, res: any, next?: () => void): `**: Resource check middleware.
- Rejects requests with 503 if memory > critical threshold (90%)
- Adds warning headers if memory > warning threshold (80%)
- Adds resource stats to response headers for observability
/

### utils

- **`export function secureCompare(a: string | undefined, b: string | undefined): boo`**: Compare two strings in constant time to prevent timing attacks.
Returns true only if both strings are non-empty and equal.
Handles undefined/null gracefully by returning false.
/

### index.ts

- **``**: Kill Switch API Service — Refactored TypeScript Entry Point
ADR-111 BCP + ADR-117 Chaos Engineering
Endpoints:
  GET  /v1/kill-switch/status   - Current state (full KillSwitchStatus)
  POST /v1/kill-switch/chaos   - Change state
  GET  /v1/kill-switch/health   - Health check
  POST /v1/auth/login          - Login
  POST /v1/auth/logout         - Logout
  GET  /v1/auth/me             - Session check
  GET  /v1/auth/ip             - IP detection
/

### config

- **`export function detectEnvironment(): Environment {`**: Detect current environment from NODE_ENV or KILL_SWITCH_ENV.
Falls back to 'development' for safety.
/
- **`function deepMerge<T extends Record<string, any>>(base: T, overrides: Partial<T>`**: Deep merge two objects. `overrides` takes precedence.
Only handles plain objects (not arrays, dates, etc).
/
- **`function buildEnvOverrides(): Partial<AppConfig> {`**: Build environment variable overrides.
These take precedence over environment defaults.
/
- **`export function loadConfig(envOverride?: Environment): AppConfig {`**: Load and validate application configuration.
Priority (highest wins):
1. Environment variables (KILL_SWITCH_*, REDIS_*, etc.)
2. Environment defaults (development/staging/production)
3. Schema defaults (from Zod .default() calls)
@throws ZodError if configuration is invalid
/
- **`let _config: AppConfig | null = null;`**: Singleton config instance — loaded once on first access.
Use this throughout the app instead of process.env.
/
- **`export function resetConfig(): void {`**: Reset config singleton — useful for testing.
/
- **`export function getEnvironment(): Environment {`**: Get current environment name.
/
- **`export function isProduction(): boolean {`**: Check if running in production.
/
- **`export function isDevelopment(): boolean {`**: Check if running in development.
/
- **`export function isFeatureEnabled(flag: keyof AppConfig['features']): boolean {`**: Check a feature flag.
/

