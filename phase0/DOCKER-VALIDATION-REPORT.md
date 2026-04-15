# Docker Validation Report — Kill Switch Import Path Mismatch

**Date:** 2026-04-14  
**Validator:** Nikaya (Code Reviewer)  
**Verdict:** ✅ FAIL on original Dockerfile — CONFIRMED broken. Fix validated.

---

## 1. Actual Import Statements (Copy-Paste from Source)

**File:** `kill-switch/kill-switch-service.mjs`

```javascript
// Line 19 — static import
import { RedisPool } from '../redis/redis-pool.mjs';

// Line 20 — static import
import { recordSpan, tracer } from '../tracing/tracing-sdk.mjs';

// Line 21 — npm package (resolves from node_modules)
import { trace } from '@opentelemetry/api';

// Line 342 — dynamic import
const { RedisPool } = await import('../redis/redis-pool.mjs');
```

All relative imports use `../` (parent directory traversal), meaning the service file **must** reside in a subdirectory for these to resolve.

---

## 2. Actual Container Structure (from `docker run`)

### Original (Broken) Dockerfile:

```
/app/
├── kill-switch-service.mjs    ← at WORKDIR root
├── redis/
│   ├── redis-pool.mjs
│   └── conf/
├── tracing/
│   ├── tracing-sdk.mjs
│   ├── trace-context-middleware.mjs
│   └── otel-collector-config.yaml
├── node_modules/
├── package.json
└── bun.lock
```

### Fixed Dockerfile:

```
/app/
├── kill-switch/
│   └── kill-switch-service.mjs    ← one level deeper
├── redis/
│   ├── redis-pool.mjs
│   └── conf/
├── tracing/
│   ├── tracing-sdk.mjs
│   ├── trace-context-middleware.mjs
│   └── otel-collector-config.yaml
├── node_modules/
├── package.json
└── bun.lock
```

---

## 3. The Exact Mismatch (Line by Line)

| Import Statement | Expected Resolution (from `/app/kill-switch-service.mjs`) | Actual File Location | Match? |
|---|---|---|---|
| `../redis/redis-pool.mjs` | `/redis/redis-pool.mjs` | `/app/redis/redis-pool.mjs` | ❌ **BROKEN** |
| `../tracing/tracing-sdk.mjs` | `/tracing/tracing-sdk.mjs` | `/app/tracing/tracing-sdk.mjs` | ❌ **BROKEN** |
| `@opentelemetry/api` | node_modules resolution | `/app/node_modules/@opentelemetry/api` | ✅ OK |

**Root cause:** `../` from `/app/kill-switch-service.mjs` traverses to `/` (container root), not `/app/`. The files live under `/app/redis/` and `/app/tracing/`, which are unreachable via `../` from `/app/`.

**Confirmed by runtime error:**
```
error: Cannot find module '../redis/redis-pool.mjs' from '/app/kill-switch-service.mjs'
```

---

## 4. Tested Solution

### Fix: Move service file into subdirectory in Dockerfile

**Changes:**
1. `COPY kill-switch/kill-switch-service.mjs ./kill-switch-service.mjs` → `COPY kill-switch/kill-switch-service.mjs ./kill-switch/kill-switch-service.mjs`
2. `CMD ["bun", "run", "kill-switch-service.mjs"]` → `CMD ["bun", "run", "kill-switch/kill-switch-service.mjs"]`

### Build & Test Results:

```
$ docker build -f kill-switch/Dockerfile.fixed -t test-kill-switch-fixed .
   ✅ BUILD SUCCESS

$ docker run --rm test-kill-switch-fixed find /app -maxdepth 3 -not -path '*/node_modules/*'
   /app/kill-switch/kill-switch-service.mjs  ← correctly in subdirectory
   /app/redis/redis-pool.mjs
   /app/tracing/tracing-sdk.mjs

$ docker run --rm test-kill-switch-fixed bun -e "import('./kill-switch/kill-switch-service.mjs')..."
   IMPORT_OK  ← module resolution works
```

**Original container:** `Cannot find module '../redis/redis-pool.mjs'`  
**Fixed container:** `IMPORT_OK` — no module resolution errors

---

## 5. Team Analysis Assessment

### Hugrukal (IMPORT-STRUCTURE-ANALYSIS.md): ✅ PASS
- Correctly identified root cause: service file at `/app/` root vs imports expecting subdirectory
- Correctly proposed Option A (preserve directory structure) as recommended fix
- Correctly noted Option B (change imports) is inferior — would require changing both static and dynamic imports

### Keridz (DOCKER-FORENSIC-ANALYSIS.md): ✅ PASS
- More thorough: identified **all** import statements including the dynamic import on line 342
- Correctly identified the same root cause
- Same fix proposed, correctly reasoned why WORKDIR change wouldn't help
- Correctly noted Option B risks missing the dynamic import

**Both analyses are accurate and consistent.** The forensic analysis was more thorough (caught dynamic import), but both reached the correct conclusion.

---

## 6. Final Working Dockerfile (Tested, Not Guessed)

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

**Changes from original (2 lines):**
1. Line 11: `./kill-switch-service.mjs` → `./kill-switch/kill-switch-service.mjs`
2. Line 19: `kill-switch-service.mjs` → `kill-switch/kill-switch-service.mjs`

---

## Additional Notes

- **Dynamic import on line 342** (`await import('../redis/redis-pool.mjs')`) is also fixed by this change — no separate action needed
- **No code changes required** — this is purely a Dockerfile path fix
- The fix preserves the host filesystem directory structure inside the container, maintaining consistency between local dev and containerized environments