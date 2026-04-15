# Import Structure Analysis
## Kill Switch Docker Container Module Resolution Error

**Date:** 2026-04-14
**Error:** `Cannot find module '../redis/redis-pool.mjs' from '/app/kill-switch-service.mjs'`

---

## 1. Import Statements from kill-switch-service.mjs

**File Location:** `/phase0/kill-switch/kill-switch-service.mjs`

**Exact Import Statements (lines 22-24):**

```javascript
import { RedisPool } from '../redis/redis-pool.mjs';
import { recordSpan, tracer } from '../tracing/tracing-sdk.mjs';
import { trace } from '@opentelemetry/api';
```

**Analysis:**
- The service uses **relative imports** with `../` (parent directory traversal)
- From `kill-switch/kill-switch-service.mjs`, `../redis/` resolves to `redis/` (sibling directory)
- From `kill-switch/kill-switch-service.mjs`, `../tracing/` resolves to `tracing/` (sibling directory)

---

## 2. Required Directory Structure

Based on the imports, the service expects this directory structure at runtime:

```
/app/
├── kill-switch/                    <-- Service must be IN a subdirectory
│   └── kill-switch-service.mjs     <-- Current file location
├── redis/
│   └── redis-pool.mjs              <-- Imported via ../redis/
└── tracing/
    └── tracing-sdk.mjs             <-- Imported via ../tracing/
```

**Import Resolution Logic:**
- Service location: `/app/kill-switch/kill-switch-service.mjs`
- Import `../redis/redis-pool.mjs` resolves to: `/app/redis/redis-pool.mjs` ✓
- Import `../tracing/tracing-sdk.mjs` resolves to: `/app/tracing/tracing-sdk.mjs` ✓

---

## 3. Current Dockerfile COPY Commands

**File Location:** `/phase0/kill-switch/Dockerfile`

**Exact Dockerfile Content:**

```dockerfile
FROM oven/bun:1.2-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy ALL directories to preserve import structure
# kill-switch-service.mjs imports from '../redis/' and '../tracing/'
# So we need the full directory structure in the container
COPY redis/ ./redis/
COPY tracing/ ./tracing/
COPY kill-switch/kill-switch-service.mjs ./kill-switch-service.mjs

# Install dependencies
RUN bun add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/api \
    @opentelemetry/semantic-conventions redis

EXPOSE 3000

CMD ["bun", "run", "kill-switch-service.mjs"]
```

---

## 4. The Mismatch

### What the Dockerfile Actually Creates:

```
/app/                               <-- WORKDIR
├── kill-switch-service.mjs         <-- Copied to ROOT of /app
├── redis/                          <-- Copied to ./redis/
│   └── redis-pool.mjs
└── tracing/                        <-- Copied to ./tracing/
    └── tracing-sdk.mjs
```

### Import Resolution at Runtime:

- Service location: `/app/kill-switch-service.mjs`
- Import `../redis/redis-pool.mjs` resolves to: `/redis/redis-pool.mjs` ✗ **(OUTSIDE /app!)**
- Import `../tracing/tracing-sdk.mjs` resolves to: `/tracing/tracing-sdk.mjs` ✗ **(OUTSIDE /app!)**

### The Problem:

| Expected Path | Actual Path | Status |
|--------------|-------------|--------|
| `/app/redis/redis-pool.mjs` | `/app/redis/redis-pool.mjs` | ✓ File exists here |
| `/app/tracing/tracing-sdk.mjs` | `/app/tracing/tracing-sdk.mjs` | ✓ File exists here |
| Import resolves to `/redis/redis-pool.mjs` | File is at `/app/redis/redis-pool.mjs` | ✗ **MISMATCH** |

**Root Cause:** The service file is copied to `/app/kill-switch-service.mjs` (root of WORKDIR), but the imports expect to traverse UP from a subdirectory (`../` from `/app/kill-switch/` would be `/app/`).

---

## 5. The Fix

### Option A: Preserve Directory Structure (RECOMMENDED)

Copy the entire `kill-switch/` directory instead of just the service file:

```dockerfile
FROM oven/bun:1.2-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy ALL directories to preserve import structure
COPY redis/ ./redis/
COPY tracing/ ./tracing/
COPY kill-switch/ ./kill-switch/          # <-- CHANGED: Copy entire directory

# Install dependencies
RUN bun add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
    @opentelemetry/exporter-trace-otlp-grpc @opentelemetry/api \
    @opentelemetry/semantic-conventions redis

EXPOSE 3000

# Update CMD path
CMD ["bun", "run", "kill-switch/kill-switch-service.mjs"]   # <-- CHANGED: Add subdirectory
```

### Option B: Change Imports (NOT RECOMMENDED)

Modify imports in `kill-switch-service.mjs` to use `./` instead of `../`:

```javascript
// CURRENT (breaks with current Dockerfile):
import { RedisPool } from '../redis/redis-pool.mjs';
import { recordSpan, tracer } from '../tracing/tracing-sdk.mjs';

// WOULD WORK with current Dockerfile:
import { RedisPool } from './redis/redis-pool.mjs';
import { recordSpan, tracer } from './tracing/tracing-sdk.mjs';
```

**Why Option A is preferred:**
- Maintains consistency with host directory structure
- Other services may have similar import patterns
- No code changes required
- Follows principle of least surprise

---

## Summary

| Aspect | Finding |
|--------|---------|
| **Error Cause** | Service file placed at `/app/kill-switch-service.mjs` but imports expect parent traversal from `/app/kill-switch/kill-switch-service.mjs` |
| **Fix Type** | Dockerfile change (not code change) |
| **Fix Action** | Change `COPY kill-switch/kill-switch-service.mjs ./kill-switch-service.mjs` to `COPY kill-switch/ ./kill-switch/` and update CMD path |
| **Risk Level** | Low - simple path correction |

---

## Verification Steps After Fix

1. Rebuild container: `docker compose build kill-switch-api`
2. Run container: `docker compose up -d kill-switch-api`
3. Check logs: `docker logs kill-switch-api`
4. Verify no module resolution errors
5. Test health endpoint: `curl http://localhost:3000/v1/kill-switch/health`
