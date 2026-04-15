# Redis Cluster - Phase 0 Infrastructure

## Quick Start (Dev)

```bash
cd /home/andlersrv/.openclaw/workspace/phase0/redis
docker compose up -d
# Wait for cluster init (watch logs)
docker compose logs -f redis-cluster-init
```

## Architecture

### Dev (Single Host)
- 3 Redis nodes on ports 6379, 6380, 6381
- Cluster bus on 16379, 16380, 16381
- No replicas (3 masters only)
- Prometheus exporter on port 9121

### Prod (Multi-AZ)
- Minimum 6 nodes: 3 masters + 3 replicas
- Each master in a different AZ
- Replicas cross-AZ for HA
- Sentinel or operator for failover
- Persistent volumes with backup

## Key Patterns

| Pattern | ADR | TTL | Purpose |
|---------|-----|-----|---------|
| `ratelimit:{client_id}:{bucket}` | ADR-112 | 1h | Token bucket counters |
| `ws:conn:{user_id}` | ADR-113 | Session | Connection registry |
| `flags:{flag_name}` | ADR-116 | 5min | Flag cache |
| `chaos:kill-switch` | ADR-117 | None | Kill switch state |
| `chaos:experiment:{id}` | ADR-117 | Duration | Experiment state |

## Node.js Integration

```javascript
import { RedisPool } from './redis-pool.mjs';

const redis = new RedisPool({
  urls: ['redis://localhost:6379', 'redis://localhost:6380', 'redis://localhost:6381'],
  poolSize: 10,
  circuitBreaker: { failureThreshold: 5, resetTimeoutMs: 30000 },
  localCache: { maxEntries: 1000, defaultTtlMs: 60000 },
});

await redis.connect();

// Feature flag with 5min TTL
await redis.set(redis.flagsKey('chaos_experiments'), JSON.stringify({ enabled: false }), { ttlMs: 300000 });

// Kill switch (no TTL)
await redis.set(redis.chaosKillSwitchKey(), 'ARMED');

// Health check
const health = await redis.healthCheck();
```

## Circuit Breaker Behavior

- **CLOSED**: All requests go to Redis. Local cache backfilled on reads.
- **OPEN**: All requests served from local cache (fail-open). Writes go to local cache only.
- **HALF_OPEN**: Limited probe requests go to Redis. Success → CLOSED. Failure → OPEN.

## Monitoring

Prometheus metrics via redis-exporter on port 9121.
Circuit breaker state changes emitted as events.