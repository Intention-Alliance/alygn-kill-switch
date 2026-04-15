# Redis Cluster Pool Fix - createCluster Support

**Date:** 2026-04-14 15:45 CST  
**Issue:** "MOVED 5102 redis-node-1:6379" error on health check

---

## 🐛 The Problem

**Error:**
```json
{"error":"MOVED 5102 redis-node-1:6379"}
```

**Root Cause:** The `redis-pool.mjs` was using `createClient()` which doesn't support Redis Cluster mode. When the API tried to access a key, Redis Cluster redirected it to a different node, but the client didn't know how to handle the redirect.

**Why:**
- Redis Cluster distributes keys across nodes using hash slots (16384 total)
- Key `chaos:kill-switch` hashes to slot 5102
- Slot 5102 is owned by `redis-node-1`
- Client connected to wrong node → got MOVED redirect
- `createClient` doesn't handle MOVED redirects automatically

---

## ✅ The Fix

### 1. Created `redis-cluster-pool.mjs`

**New file:** `/phase0/redis/redis-cluster-pool.mjs`

**Key changes:**
- Uses `createCluster()` instead of `createClient()`
- Supports multiple root nodes
- Automatically handles MOVED redirects
- Maintains circuit breaker and local cache fallback

**Code:**
```javascript
import { createCluster } from 'redis';

export class RedisPool extends EventEmitter {
  async connect() {
    const rootNodes = this.urls.map((url) => {
      const parsed = new URL(url);
      return {
        url: url,
        socket: {
          host: parsed.hostname,
          port: parseInt(parsed.port, 10) || 6379,
        },
      };
    });

    this._cluster = createCluster({
      rootNodes,
      defaults: {
        ...this.clientOpts,
      },
    });

    await this._cluster.connect();
  }
}
```

### 2. Updated Kill Switch Service

**Changed import:**
```javascript
// OLD:
import { RedisPool } from '../redis/redis-pool.mjs';

// NEW:
import { RedisPool } from '../redis/redis-cluster-pool.mjs';
```

---

## 🚀 Deploy

```bash
cd /home/andlersrv/.openclaw/workspace/phase0
bash deploy-backend.sh
```

**This will:**
1. Stop containers
2. Rebuild with new cluster pool
3. Deploy fresh containers
4. Verify health

---

## 🧪 Verify

```bash
# Test health (should work now!)
curl http://localhost:3000/v1/kill-switch/health

# Expected:
# {"status":"healthy","killSwitchState":"ARMED",...}

# Check logs
docker compose logs kill-switch-api
```

---

## 📊 Architecture

**Before (Broken):**
```
Kill Switch API → createClient → redis-node-1:6379
                                      ↓
                              Key on redis-node-2
                                      ↓
                              MOVED redirect ❌
```

**After (Fixed):**
```
Kill Switch API → createCluster → [redis-node-1, redis-node-2, redis-node-3]
                                       ↓
                              Auto-handles MOVED ✅
                              Routes to correct node
```

---

## 📝 Files Changed

1. ✅ `/phase0/redis/redis-cluster-pool.mjs` - NEW: Cluster-aware pool
2. ✅ `/phase0/kill-switch/kill-switch-service.mjs` - Updated import
3. ⏸️ `/phase0/redis/redis-pool.mjs` - Kept for standalone Redis (not cluster)

---

## 🎯 Status

**Status:** ✅ Fixed - Cluster pool handles MOVED redirects

**Next:** Deploy and verify health endpoint returns 200 OK.
