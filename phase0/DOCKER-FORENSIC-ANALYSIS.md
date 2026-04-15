# Docker Build Forensic Analysis

## 1. Every Import Statement (Line by Line)

### `kill-switch/kill-switch-service.mjs`

| Line | Import | Type |
|------|--------|------|
| 19 | `import { RedisPool } from '../redis/redis-pool.mjs'` | Relative (sibling dir) |
| 20 | `import { recordSpan, tracer } from '../tracing/tracing-sdk.mjs'` | Relative (sibling dir) |
| 21 | `import { trace } from '@opentelemetry/api'` | npm package |
| 342 | `const { RedisPool } = await import('../redis/redis-pool.mjs')` | Dynamic relative (sibling dir) |
| 359 | `const server = await import('http')` | Node built-in |

### `tracing/tracing-sdk.mjs`

| Line | Import | Type |
|------|--------|------|
| 13 | `import { NodeSDK } from '@opentelemetry/sdk-node'` | npm package |
| 14 | `import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'` | npm package |
| 15 | `import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc'` | npm package |
| 16 | `import { resourceFromAttributes } from '@opentelemetry/resources'` | npm package |
| 17 | `import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'` | npm package |
| 18 | `import apiPkg from '@opentelemetry/api'` | npm package |

### `tracing/trace-context-middleware.mjs`

| Line | Import | Type |
|------|--------|------|
| 12 | `import { context, propagation, trace } from '@opentelemetry/api'` | npm package |
| 13 | `import { getTraceHeaders, extractTraceContext } from './tracing-sdk.mjs'` | Relative (same dir) |

### `redis/redis-pool.mjs`

| Line | Import | Type |
|------|--------|------|
| 14 | `import { createClient } from 'redis'` | npm package |
| 15 | `import { EventEmitter } from 'events'` | Node built-in |

---

## 2. Path Resolution Analysis

The service file (`kill-switch-service.mjs`) uses `../redis/` and `../tracing/` — meaning it expects to live **inside a subdirectory** (like `kill-switch/`), with `redis/` and `tracing/` as **sibling directories** at the same level.

**On the host filesystem (working):**
```
/phase0/
├── kill-switch/
│   └── kill-switch-service.mjs   ← imports ../redis/ and ../tracing/
├── redis/
│   └── redis-pool.mjs
└── tracing/
    ├── tracing-sdk.mjs
    └── trace-context-middleware.mjs
```

From `kill-switch/kill-switch-service.mjs`:
- `../redis/redis-pool.mjs` → `/phase0/redis/redis-pool.mjs` ✅
- `../tracing/tracing-sdk.mjs` → `/phase0/tracing/tracing-sdk.mjs` ✅

---

## 3. Current Container Structure (What Dockerfile Creates)

```dockerfile
WORKDIR /app

COPY redis/ ./redis/
COPY tracing/ ./tracing/
COPY kill-switch/kill-switch-service.mjs ./kill-switch-service.mjs

CMD ["bun", "run", "kill-switch-service.mjs"]
```

**Resulting container filesystem:**
```
/app/
├── kill-switch-service.mjs   ← imports ../redis/ and ../tracing/
├── redis/
│   └── redis-pool.mjs
└── tracing/
    ├── tracing-sdk.mjs
    └── trace-context-middleware.mjs
```

From `/app/kill-switch-service.mjs`:
- `../redis/redis-pool.mjs` → `/redis/redis-pool.mjs` ❌ (file is at `/app/redis/redis-pool.mjs`)
- `../tracing/tracing-sdk.mjs` → `/tracing/tracing-sdk.mjs` ❌ (file is at `/app/tracing/tracing-sdk.mjs`)

---

## 4. Expected Container Structure (What Imports Need)

For `../redis/` and `../tracing/` imports to resolve, the service file must be **one directory deeper** than `redis/` and `tracing/`. Two valid layouts:

### Layout A: Service in subdirectory
```
/app/
├── kill-switch/
│   └── kill-switch-service.mjs   ← ../redis/ resolves to /app/redis/ ✅
├── redis/
│   └── redis-pool.mjs
└── tracing/
    ├── tracing-sdk.mjs
    └── trace-context-middleware.mjs
```

### Layout B: Service at root, imports changed to `./redis/`
```
/app/
├── kill-switch-service.mjs       ← ./redis/ resolves to /app/redis/ ✅
├── redis/
│   └── redis-pool.mjs
└── tracing/
    ├── tracing-sdk.mjs
    └── trace-context-middleware.mjs
```

---

## 5. Root Cause

**The service file is copied to `/app/kill-switch-service.mjs` (flat), but its imports use `../redis/` and `../tracing/` (which assume it lives in a subdirectory).**

`../redis/` from `/app/kill-switch-service.mjs` resolves to `/redis/redis-pool.mjs`, but the file is actually at `/app/redis/redis-pool.mjs`. The `..` goes above `/app/` to the container root `/`, where no `redis/` directory exists.

---

## 6. The Fix

**Option A: Change Dockerfile to match imports** ✅ RECOMMENDED

This preserves the original import structure and requires zero code changes:

```dockerfile
FROM oven/bun:1.2-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy shared modules to their sibling positions
COPY redis/ ./redis/
COPY tracing/ ./tracing/

# Copy service INTO a subdirectory so ../redis/ and ../tracing/ resolve correctly
COPY kill-switch/kill-switch-service.mjs ./kill-switch/kill-switch-service.mjs

# Install dependencies
RUN bun add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/api \
    @opentelemetry/semantic-conventions redis

EXPOSE 3000

CMD ["bun", "run", "kill-switch/kill-switch-service.mjs"]
```

**What changes:**
- `COPY kill-switch/kill-switch-service.mjs ./kill-switch-service.mjs` → `COPY kill-switch/kill-switch-service.mjs ./kill-switch/kill-switch-service.mjs`
- `CMD ["bun", "run", "kill-switch-service.mjs"]` → `CMD ["bun", "run", "kill-switch/kill-switch-service.mjs"]`

**Resulting container:**
```
/app/
├── kill-switch/
│   └── kill-switch-service.mjs   ← ../redis/ → /app/redis/ ✅
├── redis/
│   └── redis-pool.mjs
└── tracing/
    ├── tracing-sdk.mjs
    └── trace-context-middleware.mjs
```

All `../redis/` and `../tracing/` imports now resolve correctly. No code changes needed.

---

### Why NOT Option B or C?

- **Option B (change imports):** Would require changing `../redis/` → `./redis/` in both static and dynamic imports. Risky — easy to miss the dynamic import on line 342. Also deviates from the host filesystem structure, creating a mismatch between local and container layouts.
- **Option C (change WORKDIR):** Setting `WORKDIR /app/kill-switch` would break the `COPY redis/ ./redis/` destination (it would land in `/app/kill-switch/redis/`), and then `../redis/` would resolve to `/app/redis/` which still doesn't exist. WORKDIR doesn't help here.