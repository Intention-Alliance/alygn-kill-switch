# Phase 0 - Redis Cluster + Tracing + Kill Switch Backend

## Infrastructure Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Phase 0 Stack                         │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Redis-1  │  │ Redis-2  │  │ Redis-3  │  ← Cluster   │
│  │ :6379    │  │ :6380    │  │ :6381    │              │
│  └──────────┘  └──────────┘  └──────────┘              │
│       │              │            │                      │
│  ┌────────────────┐  ┌──────────────────────┐           │
│  │ Redis Exporter │  │  Kill Switch API     │           │
│  │ :9121          │  │  :11435              │           │
│  └────────────────┘  └──────────────────────┘           │
│                                                         │
│  ┌────────────────┐  ┌──────────────────────┐           │
│  │ OTel Collector │→│ Jaeger               │           │
│  │ :4317/:4318    │  │ :16686 (UI)          │           │
│  └────────────────┘  └──────────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Start all infrastructure
cd /home/andlersrv/.openclaw/workspace/phase0
docker compose up -d

# Wait for cluster init
docker compose logs -f redis-cluster-init

# Verify
curl http://localhost:16686    # Jaeger UI
curl http://localhost:11435/v1/kill-switch/health  # Kill Switch health
```

## Individual Services

| Service | Port | Purpose |
|---------|------|---------|
| Redis Cluster | 6379-6381 | Shared state (ADR-112/113/116/117) |
| Redis Exporter | 9121 | Prometheus metrics |
| OTel Collector | 4317/4318 | Trace ingestion |
| Jaeger UI | 16686 | Trace visualization |
| Kill Switch API | 11435 | BCP kill switch (ADR-111/117) |

## Directory Structure

```
phase0/
├── docker-compose.yml          # Full stack
├── redis/
│   ├── docker-compose.yml      # Redis standalone
│   ├── redis-pool.mjs          # Connection pool + circuit breaker
│   ├── conf/
│   │   ├── node-1.conf
│   │   ├── node-2.conf
│   │   └── node-3.conf
│   └── README.md
├── tracing/
│   ├── docker-compose.yml      # OTel + Jaeger standalone
│   ├── otel-collector-config.yaml
│   ├── tracing-sdk.mjs         # Node.js OTel SDK
│   ├── trace-context-middleware.mjs
│   └── README.md
├── kill-switch/
│   ├── docker-compose.yml       # Kill Switch standalone
│   ├── Dockerfile
│   ├── kill-switch-service.mjs  # API service
│   └── README.md               # API contract (for Gimglich)
```

## ADR Coverage

| ADR | Component | Status |
|-----|-----------|--------|
| ADR-111 | BCP Kill Switch | ✅ Implemented |
| ADR-112 | Redis key patterns | ✅ Ready (pool + patterns) |
| ADR-113 | WebSocket conn registry keys | ✅ Ready (key pattern) |
| ADR-115 | Distributed Tracing | ✅ OTel + Jaeger |
| ADR-116 | Feature flag cache keys | ✅ Ready (key pattern + 5min TTL) |
| ADR-117 | Chaos kill switch + experiment keys | ✅ Implemented |

## Next Steps (for Chanshuk)

1. **Integration test**: Redis cluster → PubSub → Kill Switch < 30s
2. **Nginx config**: Add kill-switch proxy to existing nginx config
3. **Frontend handoff**: Share API contract with Gimglich
4. **OTel SDK integration**: Add `tracing-sdk.mjs` to existing services