# Docker Deployment Guide — Phase 0

## Architecture Decision

**Single Master Compose** — all services in one file: `docker-compose.yml`

The sub-directory compose files (`kill-switch/docker-compose.yml`, `redis/docker-compose.yml`) are **reference only**. Do NOT use them for deployment. They will cause port conflicts with the master compose.

## Quick Start

```bash
cd /phase0/
bash DEPLOY-DOCKER-FIXED.sh
```

Or manually:

```bash
cd /phase0/
docker compose up -d --build
```

## Services & Ports

| Service | Host Port | Container Port | Notes |
|---------|-----------|----------------|-------|
| redis-node-1 | 6379 | 6379 | Cluster bus: 16379 |
| redis-node-2 | 6380 | 6379 | Cluster bus: 16380 |
| redis-node-3 | 6381 | 6379 | Cluster bus: 16381 |
| redis-exporter | 9121 | 9121 | Prometheus metrics |
| kill-switch-api | **3000** | 3000 | Internal, nginx /api/ → :3000/v1/ |
| jaeger | 16686 | 16686 | Tracing UI |
| otel-collector | 4317 | 4317 | OTLP gRPC |
| otel-collector | 4318 | 4318 | OTLP HTTP |

## Port Conflict Resolution

The root cause was **duplicate Redis definitions** across compose files:
- `kill-switch/docker-compose.yml` defined its own `redis-node-1` on port 6379
- The master `docker-compose.yml` also defined `redis-node-1` on port 6379
- Starting both caused `port already allocated` errors

**Fix:** Kill Switch API now uses the shared Redis cluster from the master compose. No standalone Redis in kill-switch compose.

## Kill Switch API

- **Internal port:** 3000 (nginx proxies `/api/` → `localhost:3000/v1/`)
- **Health:** `curl http://localhost:3000/v1/kill-switch/health`
- **Status:** `curl http://localhost:3000/v1/kill-switch/status`
- **Control:** `POST http://localhost:3000/v1/kill-switch/chaos`
- **External access:** Via Admin UI on port 8443 (SSL) at `/api/`
- **Control:** `POST http://localhost:3000/v1/kill-switch/chaos`

## Dockerfile Notes

The Dockerfile uses `context: .` (phase0 root) so COPY paths match the repo structure:
- `COPY redis/redis-pool.mjs ./redis/redis-pool.mjs`
- `COPY tracing/tracing-sdk.mjs ./tracing/tracing-sdk.mjs`
- `COPY kill-switch/kill-switch-service.mjs ./kill-switch/kill-switch-service.mjs`

This matches the import paths in `kill-switch-service.mjs`:
- `import { RedisPool } from '../redis/redis-pool.mjs'` → resolves to `./redis/redis-pool.mjs`
- `import { recordSpan } from '../tracing/tracing-sdk.mjs'` → resolves to `./tracing/tracing-sdk.mjs`

## Troubleshooting

### Port already allocated

```bash
# Find what's using a port
sudo lsof -i :6379
# or
ss -tlnp | grep 6379

# Stop all phase0 containers
docker compose down --remove-orphans

# Nuclear option: remove all stopped containers
docker container prune -f
```

### Container won't start

```bash
# Check logs
docker compose logs kill-switch-api
docker compose logs redis-node-1

# Rebuild from scratch
docker compose up -d --build --force-recreate
```

### Redis cluster not forming

```bash
# Check cluster status
docker exec redis-node-1 redis-cli cluster info
docker exec redis-node-1 redis-cli cluster nodes

# Re-init cluster
docker compose up -d redis-cluster-init
```

### Kill Switch API unhealthy

```bash
# Check if Redis is reachable from the API container
docker exec kill-switch-api curl -s http://localhost:3000/v1/kill-switch/health

# Check Redis connectivity
docker exec kill-switch-api sh -c "curl -s redis://redis-node-1:6379" || echo "Redis unreachable"

# Check environment variables
docker exec kill-switch-api env | grep -E 'REDIS|OTEL|KILL_SWITCH'
```

## Environment Variables

Create a `.env` file in `/phase0/`:

```env
KILL_SWITCH_AUTH_TOKEN=your-auth-token-here
KILL_SWITCH_API_KEY=your-api-key-here
REDIS_PASSWORD=  # optional, empty for dev
```