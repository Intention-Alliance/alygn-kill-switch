# Docker Architecture Analysis - Phase 0

**Date:** 2026-04-14  
**Status:** ⚠️ CRITICAL CONFLICTS IDENTIFIED

---

## 🔴 Current Conflicts

### 1. Port Conflicts (CRITICAL)

| Port      | Service        | File 1               | File 2                           | Conflict                   |
| --------- | -------------- | -------------------- | -------------------------------- | -------------------------- |
| **6379**  | Redis Node 1   | `docker-compose.yml` | `redis/docker-compose.yml`       | ❌ BOTH bind to host 6379  |
| **6379**  | Redis Node 1   | `docker-compose.yml` | `kill-switch/docker-compose.yml` | ❌ BOTH bind to host 6379  |
| **6380**  | Redis Node 2   | `docker-compose.yml` | `redis/docker-compose.yml`       | ❌ BOTH bind to host 6380  |
| **6381**  | Redis Node 3   | `docker-compose.yml` | `redis/docker-compose.yml`       | ❌ BOTH bind to host 6381  |
| **16379** | Redis Bus 1    | `docker-compose.yml` | `redis/docker-compose.yml`       | ❌ BOTH bind to host 16379 |
| **16380** | Redis Bus 2    | `docker-compose.yml` | `redis/docker-compose.yml`       | ❌ BOTH bind to host 16380 |
| **16381** | Redis Bus 3    | `docker-compose.yml` | `redis/docker-compose.yml`       | ❌ BOTH bind to host 16381 |
| **9121**  | Redis Exporter | `docker-compose.yml` | `redis/docker-compose.yml`       | ❌ BOTH bind to host 9121  |

**Impact:** Cannot run multiple compose files simultaneously. Docker will fail with "port already allocated" errors.

### 2. Service Name Conflicts (CRITICAL)

| Service Name         | Defined In                                       | Conflict                    |
| -------------------- | ------------------------------------------------ | --------------------------- |
| `redis-node-1`       | All 3 files                                      | ❌ Container name collision |
| `redis-node-2`       | All 3 files                                      | ❌ Container name collision |
| `redis-node-3`       | All 3 files                                      | ❌ Container name collision |
| `redis-cluster-init` | `docker-compose.yml`, `redis/docker-compose.yml` | ❌ Duplicate                |
| `redis-exporter`     | `docker-compose.yml`, `redis/docker-compose.yml` | ❌ Duplicate                |

**Impact:** Even with different compose files, container names are hardcoded and will conflict.

### 3. Network Conflicts (HIGH)

| Network      | Defined In                                       | Subnet        | Conflict                        |
| ------------ | ------------------------------------------------ | ------------- | ------------------------------- |
| `phase0-net` | `docker-compose.yml`, `redis/docker-compose.yml` | 172.28.0.0/16 | ⚠️ Same subnet                  |
| `phase0-net` | `kill-switch/docker-compose.yml`                 | Not defined   | ❌ References undefined network |

**Impact:**

- kill-switch compose will fail if run alone (network doesn't exist)
- Running multiple compose files creates network conflicts

### 4. Volume Conflicts (MEDIUM)

| Volume         | Defined In                                       | Conflict                  |
| -------------- | ------------------------------------------------ | ------------------------- |
| `redis-1-data` | `docker-compose.yml`, `redis/docker-compose.yml` | ⚠️ Named volume collision |
| `redis-2-data` | `docker-compose.yml`, `redis/docker-compose.yml` | ⚠️ Named volume collision |
| `redis-3-data` | `docker-compose.yml`, `redis/docker-compose.yml` | ⚠️ Named volume collision |

**Impact:** If both compose files run, they share the same volumes (data corruption risk).

### 5. Configuration Inconsistency (HIGH)

**kill-switch/docker-compose.yml has a critical bug:**

```yaml
environment:
  - REDIS_URLS=redis://redis-node-1:6379,redis://redis-node-2:6379,redis://redis-node-3:6379
```

But it only defines `redis-node-1` in its services! The kill-switch API will fail to connect to nodes 2 and 3.

---

## 📊 Current Architecture (Broken)

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOST MACHINE                                  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ docker-compose.yml (Main)                               │    │
│  │ - redis-node-1:6379 (host: 6379)                        │    │
│  │ - redis-node-2:6380 (host: 6380)                        │    │
│  │ - redis-node-3:6381 (host: 6381)                        │    │
│  │ - redis-cluster-init                                    │    │
│  │ - redis-exporter:9121                                   │    │
│  │ - jaeger:16686                                          │    │
│  │ - otel-collector:4317, 4318                             │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ redis/docker-compose.yml (REDUNDANT!)                   │    │
│  │ - redis-node-1:6379 (host: 6379) ❌ CONFLICT            │    │
│  │ - redis-node-2:6380 (host: 6380) ❌ CONFLICT            │    │
│  │ - redis-node-3:6381 (host: 6381) ❌ CONFLICT            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ kill-switch/docker-compose.yml (INCOMPLETE)             │    │
│  │ - redis-node-1:6379 (host: 6379) ❌ CONFLICT            │    │
│  │ - kill-switch-api:3000                                  │    │
│  │   └─ Expects: redis-node-2, redis-node-3 ❌ MISSING     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## ✅ Recommended Architecture

### Solution: Single Master Compose File

**Merge everything into ONE `docker-compose.yml`** with proper service organization.

**Rationale:**

1. All services are tightly coupled (Kill Switch depends on Redis cluster)
2. No benefit to separate deployment (same host, same network)
3. Eliminates all port/service/volume conflicts
4. Simplifies operations (one command to start/stop everything)

### Proposed Structure

```
/phase0/
├── docker-compose.yml          # SINGLE master file (merge all services)
├── docker-compose.override.yml # Local dev overrides (optional)
├── redis/
│   └── conf/                   # Redis configs (keep)
├── kill-switch/
│   ├── Dockerfile
│   └── src/                    # Kill Switch code (keep)
├── tracing/
│   └── otel-collector-config.yaml
└── DOCKER-ARCHITECTURE.md      # This file
```

---

## 🏗️ Target Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     PHASE 0 - SINGLE STACK                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ docker-compose.yml (MASTER)                                │ │
│  │                                                            │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │ REDIS CLUSTER (Internal Network)                    │  │ │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │  │ │
│  │  │  │ redis-node-1 │  │ redis-node-2 │  │redis-node-3│ │  │ │
│  │  │  │ :6379        │  │ :6379        │  │ :6379     │ │  │ │
│  │  │  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │  │ │
│  │  │         └─────────────────┴────────────────┘        │  │ │
│  │  │                    Cluster Bus                       │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │ APPLICATION LAYER                                   │  │ │
│  │  │  ┌──────────────────────────────────────────────┐   │  │ │
│  │  │  │ kill-switch-api:3000                         │   │  │ │
│  │  │  │ - Connects to all 3 Redis nodes              │   │  │ │
│  │  │  │ - Exposes health endpoint                    │   │  │ │
│  │  │  └──────────────────────────────────────────────┘   │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │  ┌─────────────────────────────────────────────────────┐  │ │
│  │  │ OBSERVABILITY                                       │  │ │
│  │  │  ┌──────────────┐      ┌──────────────────────┐    │  │ │
│  │  │  │ redis-exporter│─────▶│ jaeger               │    │  │ │
│  │  │  │ :9121        │      │ :16686 (UI)          │    │  │ │
│  │  │  └──────────────┘      │ :14268 (collector)   │    │  │ │
│  │  │                        └──────────┬───────────┘    │  │ │
│  │  │  ┌──────────────┐                 │                │  │ │
│  │  │  │ otel-collector│────────────────┘                │  │ │
│  │  │  │ :4317, :4318 │                                   │  │ │
│  │  │  └──────────────┘                                   │  │ │
│  │  └─────────────────────────────────────────────────────┘  │ │
│  │                                                            │ │
│  │  NETWORK: phase0-net (172.28.0.0/16)                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  HOST PORT MAPPINGS:                                            │
│  - 6379  → redis-node-1 (external access)                       │
│  - 6380  → redis-node-2 (external access)                       │
│  - 6381  → redis-node-3 (external access)                       │
│  - 3000  → kill-switch-api                                      │
│  - 9121  → redis-exporter (Prometheus scrape)                   │
│  - 16686 → jaeger UI                                            │
│  - 4317  → otel-collector (OTLP gRPC)                           │
│  - 4318  → otel-collector (OTLP HTTP)                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📋 Service Dependency Graph

```
                    ┌─────────────────┐
                    │  redis-node-1   │
                    │  redis-node-2   │
                    │  redis-node-3   │
                    └────────┬────────┘
                             │ (depends_on: healthy)
                             ▼
                    ┌─────────────────┐
                    │redis-cluster-init│
                    │  (runs once)     │
                    └─────────────────┘

                    ┌─────────────────┐
                    │  redis-node-1   │
                    │  redis-node-2   │
                    │  redis-node-3   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │ kill-switch │  │redis-exporter│ │   jaeger    │
    │    -api     │  │             │  │             │
    └─────────────┘  └─────────────┘  └──────┬──────┘
                                             │
                                             ▼
                                    ┌─────────────────┐
                                    │ otel-collector  │
                                    └─────────────────┘
```

---

## 🛠️ Migration Plan

### Step 1: Backup Current State

```bash
cd /home/andlersrv/.openclaw/workspace/phase0
cp docker-compose.yml docker-compose.yml.backup
cp redis/docker-compose.yml redis/docker-compose.yml.backup
cp kill-switch/docker-compose.yml kill-switch/docker-compose.yml.backup
```

### Step 2: Create Merged docker-compose.yml

**Actions:**

1. Keep main `docker-compose.yml` as base (has Redis + OTel + Jaeger)
2. Add `kill-switch-api` service from `kill-switch/docker-compose.yml`
3. Fix `REDIS_URLS` to reference correct internal hostnames
4. Remove redundant `redis/docker-compose.yml`

### Step 3: Update Kill Switch Environment

Change from:

```yaml
REDIS_URLS=redis://redis-node-1:6379,redis://redis-node-2:6379,redis://redis-node-3:6379
```

To (same, but now all 3 nodes exist in the same compose file):

```yaml
REDIS_URLS=redis://redis-node-1:6379,redis://redis-node-2:6379,redis://redis-node-3:6379
```

### Step 4: Archive Redundant Files

```bash
mv redis/docker-compose.yml redis/docker-compose.yml.ARCHIVED
mv kill-switch/docker-compose.yml kill-switch/docker-compose.yml.ARCHIVED
```

### Step 5: Deploy

```bash
cd /home/andlersrv/.openclaw/workspace/phase0
docker-compose down  # Stop any running containers
docker-compose up -d  # Start merged stack
docker-compose ps    # Verify all services running
```

---

## 📝 Alternative: Separate Deployments (NOT RECOMMENDED)

If you MUST keep separate compose files, you need:

### Option A: Different Ports

| Service      | Main Compose | Redis Compose | Kill-Switch Compose |
| ------------ | ------------ | ------------- | ------------------- |
| redis-node-1 | 6379         | 26379         | 36379               |
| redis-node-2 | 6380         | 26380         | N/A                 |
| redis-node-3 | 6381         | 26381         | N/A                 |

**Problems:**

- Kill-switch still needs all 3 nodes
- Complex configuration management
- No benefit over single compose

### Option B: External Networks

1. Start Redis cluster first (redis/docker-compose.yml)
2. Connect kill-switch to existing network
3. Use `external: true` in network config

**Problems:**

- Manual orchestration required
- Fragile deployment process
- Harder to reason about state

---

## ✅ Final Recommendation

**MERGE INTO SINGLE COMPOSE FILE**

**Reasons:**

1. ✅ Eliminates ALL conflicts
2. ✅ Simplifies deployment (one command)
3. ✅ Ensures all dependencies are available
4. ✅ Easier to maintain and update
5. ✅ Proper service orchestration via `depends_on`
6. ✅ Single source of truth for infrastructure

**Files to keep:**

- `/phase0/docker-compose.yml` (merged master)
- `/phase0/redis/conf/*.conf` (Redis configs)
- `/phase0/tracing/otel-collector-config.yaml`
- `/phase0/kill-switch/Dockerfile`
- `/phase0/kill-switch/src/` (application code)

**Files to archive/delete:**

- `/phase0/redis/docker-compose.yml` (redundant)
- `/phase0/kill-switch/docker-compose.yml` (incomplete)

---

## 🎯 Next Steps

1. **Review this analysis** with the team
2. **Approve the merge strategy**
3. **Create merged docker-compose.yml** (I can do this if approved)
4. **Test the merged stack**
5. **Archive redundant files**

---

**Questions?** The architecture is clear: one stack, one compose file, no conflicts. 📐
