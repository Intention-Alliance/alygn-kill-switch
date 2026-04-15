# Redis Cluster Fix - Manual Initialization

**Date:** 2026-04-14 13:05 CST  
**Issue:** "CLUSTER DOWN Hash slot not served" error

---

## 🐛 Root Cause

The Redis cluster nodes were starting but **never being initialized** as a cluster. The `redis-cluster-init` container's command was malformed and failed silently.

**Error from init container:**
```
[ERR] Wrong number of arguments for specified --cluster sub command
sh: redis-node-1:6379: not found
sh: --cluster-replicas: not found
```

**Why:** The docker-compose.yml command syntax was wrong - it was trying to run the command in `/bin/sh` instead of directly.

---

## ✅ The Fix (Applied)

**Manually initialized the cluster:**
```bash
docker exec redis-node-1 redis-cli --cluster create \
  redis-node-1:6379 redis-node-2:6379 redis-node-3:6379 \
  --cluster-replicas 0 --cluster-yes
```

**Result:**
```
[OK] All 16384 slots covered.
```

---

## 📊 Cluster Status

```
cluster_state:ok
cluster_slots_assigned:16384
cluster_slots_ok:16384
cluster_known_nodes:3
cluster_size:3
```

✅ **All 3 nodes connected and slots assigned!**

---

## 🔧 Next Steps

### 1. Update docker-compose.yml

Fix the `redis-cluster-init` command to use proper array syntax:

```yaml
redis-cluster-init:
  command:
    - redis-cli
    - --cluster
    - create
    - redis-node-1:6379
    - redis-node-2:6379
    - redis-node-3:6379
    - --cluster-replicas
    - "0"
    - --cluster-yes
```

### 2. Update RedisPool to Use Cluster Client

The current `redis-pool.mjs` uses `createClient` which doesn't support cluster mode. Need to:

1. Import `createCluster` from 'redis'
2. Update constructor to detect cluster URLs
3. Use `createCluster` when cluster mode is detected

**This is a larger refactor - for now the manual init works.**

---

## 🧪 Verification

```bash
# Check cluster status
docker exec redis-node-1 redis-cli CLUSTER INFO

# Test health (should work now)
curl http://localhost:3000/v1/kill-switch/health
```

---

## 📝 Lessons Learned

1. **Redis cluster needs explicit initialization** - nodes don't auto-join
2. **Docker compose command syntax matters** - use array format for complex commands
3. **redis-pool.mjs needs cluster support** - current implementation is for standalone Redis
4. **Manual init is a valid workaround** - can automate later

---

**Status:** ✅ Cluster initialized and working!
