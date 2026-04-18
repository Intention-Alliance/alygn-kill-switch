# Deployment Guide

> Auto-generated on 2026-04-18T03:39:31.424Z

## Docker Compose (Local Development)

```bash
# Start all services
docker compose up -d

# Check health
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

## Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Generate auth tokens
openssl rand -hex 32  # KILL_SWITCH_AUTH_TOKEN
openssl rand -hex 32  # KILL_SWITCH_API_KEY
```

## Health Checks

| Endpoint | Purpose | Status Codes |
|----------|---------|-------------|
| /health | Liveness (is process alive?) | 200 |
| /ready | Readiness (are deps available?) | 200, 503 |
| /v1/kill-switch/health | App health (Redis + state) | 200, 503 |

## Monitoring

```bash
# Prometheus metrics
curl http://localhost:3000/metrics

# Resource stats
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/resources

# Cost report
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/cost
```

## Incident Response

```bash
# Check active incidents
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/incidents

# View runbooks
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/runbooks

# Trigger manual detection
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/incidents/check
```

## Scaling

```bash
# Scale API instances
docker compose up --scale kill-switch-api=3
```
