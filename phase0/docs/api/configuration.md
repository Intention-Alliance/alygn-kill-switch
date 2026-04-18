# Configuration Reference

> Auto-generated on 2026-04-18T03:39:31.423Z

## Environment Detection

Configuration is loaded based on `KILL_SWITCH_ENV` or `NODE_ENV`:
- `development` — Permissive, debug-friendly
- `staging` — Mirrors production with debug access
- `production` — Hardened, strict limits

## Priority Order

1. Environment variables (highest priority)
2. Environment defaults (per environment)
3. Schema defaults (Zod .default())

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| KILL_SWITCH_ENV | Environment name | development |
| KILL_SWITCH_PORT | Server port | 3000 |
| KILL_SWITCH_AUTH_TOKEN | Auth token | (required) |
| KILL_SWITCH_API_KEY | API key | (required) |
| ADMIN_EMAIL | Admin email | admin@alygn.com |
| REDIS_URLS | Comma-separated Redis URLs | redis://localhost:6379 |
| REDIS_PASSWORD | Redis password | (empty) |
| LOG_LEVEL | Logging level | debug/info |
| OTEL_EXPORTER_OTLP_ENDPOINT | OTLP endpoint | http://otel-collector:4317 |
| OTEL_SERVICE_NAME | Service name | kill-switch-api |
| IP_ALLOWLIST | Comma-separated IPs | (defaults) |
| IP_ALLOWLIST_CIDRS | CIDR ranges | (defaults) |

## Feature Flags

| Flag | Development | Staging | Production |
|------|-------------|---------|------------|
| enableChaosEngineering | true | true | false |
| enableOpenTelemetry | false | true | true |
| enableAuditLog | true | true | true |
| enableCostTracking | true | true | true |
| enableResourceMonitor | true | true | true |
| enableIncidentResponse | true | true | true |
| enableLbHealth | true | true | true |

## Resource Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU | 70% | 90% |
| Memory | 80% | 90% |
| Disk | 85% | 95% |

## Cost Tracking Rates

| Resource | Rate |
|----------|------|
| Redis reads | $0.0001 per 1K |
| Redis writes | $0.0002 per 1K |
| Redis pub/sub | $0.00015 per 1K |
| API requests | $0.00005 per 1K |
| Compute | $0.032/hour |

