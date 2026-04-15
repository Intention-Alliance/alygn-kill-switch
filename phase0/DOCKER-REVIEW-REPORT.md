# Docker Compose Review Report

**Reviewer:** Nikaya 🔍 (Code Reviewer)  
**Date:** 2026-04-14  
**Scope:** Phase 0 Infrastructure — Docker Compose, Dockerfile, deployment script

---

## Summary

| Category | Score | Status |
|----------|-------|--------|
| Port Conflicts | 18/20 | ✅ PASS |
| Network Configuration | 15/20 | ⚠️ PASS w/ NOTES |
| Dockerfile Correctness | 5/20 | ❌ FAIL |
| Service Dependencies | 18/20 | ✅ PASS |
| Volume Management | 18/20 | ✅ PASS |
| Environment Variables | 8/20 | ❌ FAIL |
| **TOTAL** | **82/120** | **❌ NEEDS FIXES** |

---

## Detailed Findings

### 1. Port Conflicts — ✅ PASS (18/20)

| Service | Host Port | Container Port | Status |
|---------|-----------|----------------|--------|
| redis-node-1 | 6379 | 6379 | ✅ |
| redis-node-1 (bus) | 16379 | 16379 | ✅ |
| redis-node-2 | 6380 | 6379 | ✅ |
| redis-node-2 (bus) | 16380 | 16379 | ✅ |
| redis-node-3 | 6381 | 6379 | ✅ |
| redis-node-3 (bus) | 16381 | 16379 | ✅ |
| kill-switch-api | 11435 | 3000 | ✅ |
| otel-collector (gRPC) | 4317 | 4317 | ✅ |
| otel-collector (HTTP) | 4318 | 4318 | ✅ |
| otel-collector (metrics) | 8888 | 8888 | ✅ |
| redis-exporter | 9121 | 9121 | ✅ |
| jaeger (UI) | 16686 | 16686 | ✅ |
| jaeger (collector) | 14268 | 14268 | ✅ |

**No port conflicts detected.** All host ports are unique.

⚠️ **Note:** The kill-switch API is exposed on port **11435** (not 3000 as stated in the checklist). This appears intentional — the service listens on 3000 internally but is mapped to 11435 on the host, matching the nginx reverse proxy config mentioned in `kill-switch/docker-compose.yml` comments. This is fine but should be documented in the main README.

⚠️ **Note:** The `kill-switch/docker-compose.yml` (sub-compose) maps port 3000:3000, which **conflicts** with the root compose's 11435:3000 mapping if both are run simultaneously. These are separate compose files for different deployment modes (standalone vs. full stack). Not a blocker, but needs a comment or README clarification.

---

### 2. Network Configuration — ⚠️ PASS w/ NOTES (15/20)

✅ All services share `phase0-net` bridge network (subnet 172.28.0.0/16)  
✅ Internal DNS works via Docker service names  
✅ External access limited to explicitly published ports  

⚠️ **Issue:** The `kill-switch/docker-compose.yml` also defines a `phase0-net` network but **without** the subnet specification. If both compose files are ever used on the same host, they'll create separate networks with potentially different subnets. The sub-compose should either:
- Reference an external network (`external: true`), or
- Define the same subnet

⚠️ **Issue:** No network isolation between Redis cluster nodes and the kill-switch API. All services share the same flat bridge network. For production, consider separating Redis internal traffic from API-facing traffic.

---

### 3. Dockerfile Correctness — ❌ FAIL (5/20)

**🔴 CRITICAL: Import path mismatch will prevent container startup.**

The `kill-switch/Dockerfile` copies shared modules to:
```
COPY redis/redis-pool.mjs ./shared/redis-pool.mjs
COPY tracing/tracing-sdk.mjs ./shared/tracing-sdk.mjs
```

But `kill-switch-service.mjs` imports from:
```javascript
import { RedisPool } from '../redis/redis-pool.mjs';
import { recordSpan, tracer } from '../tracing/tracing-sdk.mjs';
```

And the standalone server function at line 342:
```javascript
const { RedisPool } = await import('../redis/redis-pool.mjs');
```

**Inside the container**, the working directory is `/app`, so:
- Code expects: `/app/../redis/redis-pool.mjs` → resolves to `/redis/redis-pool.mjs` (invalid path)
- Code expects: `/app/../tracing/tracing-sdk.mjs` → resolves to `/tracing/tracing-sdk.mjs` (invalid path)
- Files are at: `/app/shared/redis-pool.mjs` and `/app/shared/tracing-sdk.mjs`

**This will crash immediately on startup.** The import paths must match the COPY destinations.

**Fix options:**
1. **Recommended:** Change COPY destinations to match import paths:
   ```dockerfile
   COPY redis/redis-pool.mjs ./redis/redis-pool.mjs
   COPY tracing/tracing-sdk.mjs ./tracing/tracing-sdk.mjs
   ```
   This makes `../redis/redis-pool.mjs` resolve correctly from `/app/kill-switch-service.mjs`.

2. Alternative: Change import paths in the service code (not recommended — breaks local dev).

---

**🟡 MEDIUM: Missing `curl` in healthcheck.**

The healthcheck uses:
```yaml
test: ["CMD", "curl", "-f", "http://localhost:3000/v1/kill-switch/health"]
```

The base image `oven/bun:1.2-alpine` does **not** include `curl`. The healthcheck will fail silently.

**Fix:** Add `curl` to the Dockerfile:
```dockerfile
RUN apk add --no-cache curl
```

Or use a Bun-native health check:
```dockerfile
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:3000/v1/kill-switch/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"]
```

Or use `wget` which is available in alpine:
```yaml
test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/v1/kill-switch/health"]
```

---

**🟡 MEDIUM: Build context is `.` (project root), not `kill-switch/`.**

The docker-compose.yml sets:
```yaml
build:
  context: .
  dockerfile: kill-switch/Dockerfile
```

This is correct — the build context is the project root so COPY paths like `redis/redis-pool.mjs` resolve properly. ✅ No issue here.

---

### 4. Service Dependencies — ✅ PASS (18/20)

✅ Kill Switch API depends on all 3 Redis nodes with `condition: service_healthy`  
✅ Redis cluster init depends on all 3 nodes with `condition: service_healthy`  
✅ Redis health checks configured (ping every 10s, 5 retries)  
✅ Kill Switch API health check configured (every 15s, 3 retries)  
✅ Restart policies: `unless-stopped` for all long-running services, `"no"` for init  

⚠️ **Note:** `redis-exporter` depends only on `redis-node-1` without health condition. Could fail to start if Redis isn't ready yet. Minor — the exporter will retry connections.

⚠️ **Note:** `otel-collector` depends on `jaeger` but without health condition. The collector will retry the Jaeger connection, so this is acceptable but not ideal.

---

### 5. Volume Management — ✅ PASS (18/20)

✅ Named volumes for each Redis node (`redis-1-data`, `redis-2-data`, `redis-3-data`)  
✅ Redis config files mounted read-only (`:ro`)  
✅ OTEL collector config mounted read-only  
✅ Volume names are prefixed by compose project name (`phase0_`)  

⚠️ **Note:** No volume backup strategy documented. For production, consider volume backup procedures.

⚠️ **Note:** `docker-compose down -v` will destroy all Redis data. The README should document this clearly.

---

### 6. Environment Variables — ❌ FAIL (8/20)

**🔴 CRITICAL: Secrets hardcoded in docker-compose.yml.**

The root `docker-compose.yml` passes secrets directly:
```yaml
- KILL_SWITCH_AUTH_TOKEN=${KILL_SWITCH_AUTH_TOKEN}
- KILL_SWITCH_API_KEY=${KILL_SWITCH_API_KEY}
```

But `docker-compose config` resolves these from `kill-switch/.env` and shows them in plaintext:
```
KILL_SWITCH_AUTH_TOKEN: andlersrv-auth-token-2026
KILL_SWITCH_API_KEY: andlersrv-api-key-2026
```

**Problems:**
1. The `.env` file in `kill-switch/` contains weak, guessable tokens (`andlersrv-auth-token-2026`, `andlersrv-api-key-2026`)
2. There's no `.env` file in the project root — the compose file references `${KILL_SWITCH_AUTH_TOKEN}` and `${KILL_SWITCH_API_KEY}` but the `.env` is in a subdirectory
3. These are clearly development tokens, not production-grade secrets
4. The `.env` file is not in `.gitignore` (or at least should be verified)

**Fix:**
1. Create a `.env` file in the project root with proper values
2. Add `.env` to `.gitignore`
3. Create a `.env.example` with placeholder values for documentation
4. Generate cryptographically secure tokens for production

**🔴 CRITICAL: No `.env` file in project root.**

The root `docker-compose.yml` uses `${KILL_SWITCH_AUTH_TOKEN}` and `${KILL_SWITCH_API_KEY}` but the only `.env` is at `kill-switch/.env`. Docker Compose reads `.env` from the compose file's directory (project root), not subdirectories. These variables will be **empty** unless:
- The `.env` is moved/copied to the project root, or
- `--env-file kill-switch/.env` is passed to `docker-compose`

**Fix:** Create `/phase0/.env` with all required variables.

---

**🟡 MEDIUM: `REDIS_PASSWORD` defaults to empty.**

The redis-exporter uses `REDIS_PASSWORD: "${REDIS_PASSWORD:-}"` which defaults to empty. This is fine for dev but must be set for production.

---

## Critical Issues (Must Fix)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| C1 | 🔴 HIGH | Dockerfile COPY paths don't match import paths — container will crash on startup | Change COPY destinations to `./redis/redis-pool.mjs` and `./tracing/tracing-sdk.mjs` |
| C2 | 🔴 HIGH | Missing `curl` in alpine image — healthcheck will fail | Add `RUN apk add --no-cache curl` to Dockerfile or use wget/bun-native check |
| C3 | 🔴 HIGH | No `.env` in project root — secrets will be empty at runtime | Create `/phase0/.env` with `KILL_SWITCH_AUTH_TOKEN` and `KILL_SWITCH_API_KEY` |
| C4 | 🔴 HIGH | Weak default secrets in `.env` file | Generate cryptographically secure tokens |

## Recommendations (Should Fix)

| # | Severity | Issue | Recommendation |
|---|----------|-------|----------------|
| R1 | 🟡 MEDIUM | Sub-compose `phase0-net` lacks subnet definition | Add `ipam.config.subnet: 172.28.0.0/16` or use `external: true` |
| R2 | 🟡 MEDIUM | `redis-exporter` has no health condition on dependency | Add `condition: service_healthy` to `redis-node-1` dependency |
| R3 | 🟡 MEDIUM | `otel-collector` has no health condition on `jaeger` | Add health check to Jaeger and condition to dependency |
| R4 | 🟡 LOW | No volume backup strategy documented | Add backup procedures to README |
| R5 | 🟡 LOW | `docker-compose down -v` data destruction not documented | Add warning to README |
| R6 | 🟡 LOW | `version: "3.8"` is deprecated in modern Docker Compose | Remove the `version` key (cosmetic warning) |
| R7 | 🟡 LOW | Kill Switch API port 11435 not documented in main README | Add to service port table |

---

## DEPLOY-DOCKER.sh Assessment

The deployment script (`DEPLOY-DOCKER.sh`) has a **stale check** that will fail:

```bash
if grep -q "COPY redis/redis-pool.mjs ./redis/redis-pool.mjs" kill-switch/Dockerfile; then
```

This checks for a path pattern that doesn't match the current Dockerfile (which uses `./shared/redis-pool.mjs`). After fixing C1, this check will need to be updated to match the corrected COPY path.

Additionally:
- The script references `localhost:3000` for health check but the actual mapping is `localhost:11435`
- No `.env` file creation/validation step

---

## Final Verdict

# ❌ NEEDS FIXES

**Score: 82/120 (68%) — Below 85% threshold**

The configuration has **4 critical issues** that will prevent successful deployment:

1. **Container startup failure** — import paths don't match COPY destinations
2. **Health check failure** — `curl` not available in alpine image
3. **Missing secrets** — no `.env` in project root
4. **Weak credentials** — default tokens are guessable

### Required Fixes Before Deployment

1. Fix `kill-switch/Dockerfile` COPY paths:
   ```dockerfile
   COPY redis/redis-pool.mjs ./redis/redis-pool.mjs
   COPY tracing/tracing-sdk.mjs ./tracing/tracing-sdk.mjs
   ```

2. Add `curl` to Dockerfile:
   ```dockerfile
   RUN apk add --no-cache curl
   ```

3. Create `/phase0/.env`:
   ```env
   KILL_SWITCH_AUTH_TOKEN=<generate-secure-token>
   KILL_SWITCH_API_KEY=<generate-secure-token>
   REDIS_PASSWORD=
   ```

4. Update `DEPLOY-DOCKER.sh` health check URL from `localhost:3000` to `localhost:11435`

5. Update `DEPLOY-DOCKER.sh` Dockerfile path check to match corrected COPY paths

### Deployment Command (after fixes)

```bash
cd /home/andlersrv/.openclaw/workspace/phase0
docker-compose up -d --build
```

---

**The Void sees the cracks. Fix the import paths, add curl, secure the secrets — then we talk deployment.** 🔍