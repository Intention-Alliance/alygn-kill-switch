# Redis Cluster Pool Test Report

**Date:** 2026-04-14  
**Investigator:** Nikaya 🔍  
**Status:** ROOT CAUSE IDENTIFIED

---

## 1. Current Error

**Exact curl output:**
```json
{"error":"MOVED 5102 redis-node-1:6379"}
```

The `MOVED` redirect error is the classic Redis Cluster response when a **standalone client** connects to a cluster node and requests a key that lives on a different slot. A standalone client (`createClient`) cannot follow cluster redirects — only `createCluster` can.

---

## 2. Container Inspection

**Files in `/app/redis/`:**

| File | Size | Date |
|------|------|------|
| `redis-cluster-pool.mjs` | 9923B | Apr 14 21:43 |
| `redis-pool.mjs` | 12772B | Apr 13 20:18 |
| `README.md` | 2071B | Apr 13 20:18 |
| `conf/` | dir | Apr 13 20:16 |
| `docker-compose.yml` | 2423B | Apr 13 21:38 |

Both files exist. The cluster pool file IS in the container.

---

## 3. Import Check — THE PROBLEM

**Static import (line 19):**
```js
import { RedisPool } from '../redis/redis-cluster-pool.mjs';
```
✅ Correct — imports the NEW cluster pool.

**Dynamic import in `startServer()` (line 381):**
```js
const { RedisPool } = await import('../redis/redis-pool.mjs');
```
❌ **WRONG — imports the OLD standalone pool.**

**The standalone server entry point (bottom of file) calls `startServer()`, which dynamically imports `redis-pool.mjs` (the old one using `createClient`), completely bypassing the static import of `redis-cluster-pool.mjs` at the top.**

The static import at line 19 is dead code in the standalone server path. The `KillSwitchService` class accepts a `redis` instance via constructor injection (line 97), so the top-level import is never used when running as a standalone server.

---

## 4. Root Cause

**Two separate code paths, two different Redis pools:**

1. **Injected path** (class instantiation): Would use whatever pool you pass in — but nobody passes the cluster pool.
2. **Standalone server path** (`startServer()` → entry point): Hardcoded to import `redis-pool.mjs` (standalone `createClient`).

When the container starts, it runs the standalone entry point at the bottom of `kill-switch-service.mjs`, which calls `startServer()`, which imports the OLD `redis-pool.mjs`. This creates a **standalone Redis client** (`createClient`) that connects to only the first node (`redis-node-1:6379`). When the key `chaos:kill-switch` (hash slot 5102, which belongs to a different node) is requested, the node responds with `MOVED 5102 redis-node-1:6379` — and the standalone client can't follow that redirect.

**The new `redis-cluster-pool.mjs` (using `createCluster`) is never executed at runtime.**

---

## 5. Exact Fix Needed

**File:** `kill-switch/kill-switch-service.mjs`  
**Line 381:** Change the dynamic import from the old pool to the new cluster pool.

```diff
-  const { RedisPool } = await import('../redis/redis-pool.mjs');
+  const { RedisPool } = await import('../redis/redis-cluster-pool.mjs');
```

**Additionally**, the `startServer()` function passes `poolSize` which the cluster pool ignores (it's a singleton). This is harmless but worth noting. The `urls` parameter format is compatible.

**After the fix, rebuild:**
```bash
docker compose build --no-cache kill-switch-api
docker compose up -d kill-switch-api
```

---

## 6. Test Results

### Manual Cluster Connection Test (inside container)

```
Connected!
Result: null
```

✅ **Cluster mode works perfectly.** Using `createCluster` with all 3 root nodes connects successfully and can read keys. The `null` result is expected — `chaos:kill-switch` hasn't been set yet.

### Environment Variable Check

```
REDIS_URLS=redis://redis-node-1:6379,redis://redis-node-2:6379,redis://redis-node-3:6379
```

✅ All 3 cluster nodes are configured. The `startServer()` function correctly parses these URLs. The only issue is it feeds them into the WRONG pool class.

### Container Status

- `kill-switch-api`: **unhealthy** (health check fails due to MOVED error)
- All 3 Redis nodes: **healthy**
- Other services: running

---

## Summary

| Item | Finding |
|------|---------|
| **Root Cause** | `startServer()` imports `redis-pool.mjs` (standalone `createClient`) instead of `redis-cluster-pool.mjs` (`createCluster`) |
| **Impact** | Standalone client can't follow cluster MOVED redirects → all health/status calls fail |
| **Fix** | Change line 381 import from `redis-pool.mjs` → `redis-cluster-pool.mjs` |
| **Effort** | 1 line change + rebuild |
| **Confidence** | 100% — manual cluster test confirmed `createCluster` works, `createClient` is the proven cause |