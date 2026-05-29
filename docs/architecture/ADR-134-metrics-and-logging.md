# ADR-134: Accurate System Metrics & Journal Log Streaming

## Status

**Proposed** — 2026-05-28

## Context

The Kill Switch dashboard displays system metrics (CPU, memory, GPU, disk) and machine logs. Both features are currently inaccurate or non-functional:

### Metrics Accuracy Issues

| Metric | Current Behavior | Actual Problem | Root Cause |
|--------|-----------------|----------------|-----------|
| **CPU** | Always near 100% | `os.cpus()` returns cumulative ticks since boot, not utilization rate | No delta computation between samples |
| **Memory** | Shows host's 16GB total | Container is cgroup-limited; `os.totalmem()` bypasses cgroups | Not reading `/sys/fs/cgroup/memory.max` |
| **GPU** | Returns "N/A" (0%) | Host has **no NVIDIA GPU** (Intel i5-7500T with integrated graphics); `nvidia-smi` fails inside container | Dockerfile has no GPU passthrough (`--gpus`) |
| **Disk** | Shows overlay filesystem usage | `df -h /` inside container reports overlay, not host `/dev/nvme0n1p2` | No host mount access in docker-compose |
| **CPU Model** | "AMD Ryzen 9" (static) | Real CPU is Intel i5-7500T | Specs hardcoded at registration, never read from `/proc/cpuinfo` |

### Missing Features

| Feature | Current State | Gap |
|---------|--------------|-----|
| **Journal Log Streaming** | MachineLogs component exists but only shows mocked audit entries | No `journalctl` integration; Docker container has no access to host journal |
| **Hardware Detection** | `specs` field set once at registration, never updated | No live hardware introspection (`/proc/cpuinfo`, `/proc/meminfo`, `lscpu`) |
| **WebSocket Metrics** | `bcp:machines:metrics` channel is published to but NOT subscribed by WebSocketManager | Metrics broadcast dead-end — WebSocketManager only subscribes to 5 channels, omitting `bcp:machines:metrics` |
| **Frontend metrics handler** | `use-kill-switch-websocket.ts` has no `case "machine-metrics"` | Real-time metrics updates from WebSocket completely missing in frontend |

### Architectural Question

The containerized `server-kill-switch` sees a limited view of the host system. Two paths exist:

1. **Container-only (enhanced):** Add `--pid=host`, mount `/sys`, `/proc`, journal directories into the container. Keep all metrics collection inside the existing service.
2. **Host-side agent:** Deploy a lightweight metrics agent on the host (separate from Docker) that collects accurate host telemetry and pushes to Redis. The kill-switch service consumes from Redis.

## Decision

### 1. Container-Enhanced Approach (Path 1)

**We choose container-enhanced access** over a separate host-side agent for Phase 1. Rationale:

- **Operational simplicity:** Single service to deploy and maintain. No additional process, systemd unit, or monitoring.
- **Co-location with business logic:** Metrics collection lives alongside the kill-switch service that consumes them.
- **Docker's `--pid=host`** gives access to host `/proc`, `/sys`, and journal sockets.
- **Volume mounts** provide read-only access to host filesystems.

**Required Docker changes** (to `docker-compose.yml`):

```yaml
kill-switch:
  pid: "host"  # Access host /proc for cpuinfo, meminfo, mountinfo
  volumes:
    - /sys/fs/cgroup:/sys/fs/cgroup:ro     # cgroup memory limits
    - /proc:/host/proc:ro                  # CPU info, meminfo
    - /run/log/journal:/run/log/journal:ro # journalctl access
    - /:/host-root:ro                      # df against host /
    - kill-switch-data:/app/data
```

**Trade-offs acknowledged:**
- `--pid=host` reduces container isolation (acceptable for an observability service)
- Read-only mounts prevent any host modification risk
- If multi-host scaling is needed later, a host-side agent (Path 2) can replace this without API changes

### 2. CPU Metrics: Delta-Based Calculation

Replace the instantaneous `os.cpus()` computation with a **two-sample delta**:

```typescript
let _prevCpuTicks: { idle: number; total: number }[] | null = null;

function collectCpuUsage(): number {
  const cores = cpus();
  if (!_prevCpuTicks) {
    // First call: store baseline, return 0
    _prevCpuTicks = cores.map(c => {
      const total = Object.values(c.times).reduce((a, b) => a + b, 0);
      return { idle: c.times.idle, total };
    });
    return 0;
  }

  let totalDelta = 0, idleDelta = 0;
  for (let i = 0; i < cores.length; i++) {
    const total = Object.values(cores[i].times).reduce((a, b) => a + b, 0);
    const idle = cores[i].times.idle;
    totalDelta += total - _prevCpuTicks[i].total;
    idleDelta += idle - _prevCpuTicks[i].idle;
  }

  _prevCpuTicks = cores.map(c => {
    const total = Object.values(c.times).reduce((a, b) => a + b, 0);
    return { idle: c.times.idle, total };
  });

  if (totalDelta === 0) return 0;
  return ((totalDelta - idleDelta) / totalDelta) * 100;
}
```

This requires the metrics collection interval to be >0 (currently 5s — adequate). The first reading returns 0, second returns the actual 5-second average.

### 3. Memory: Cgroup-Aware Reading

Read cgroup memory limits from the container's own cgroup, falling back to `/proc/meminfo` on the host:

```typescript
function collectMemoryUsage(): { usage: number; totalMb: number; usedMb: number } {
  // Try cgroup v2 first (most common for modern Docker)
  const cgroupMax = readFileNumber('/sys/fs/cgroup/memory.max');
  const cgroupCurrent = readFileNumber('/sys/fs/cgroup/memory.current');
  if (cgroupMax && cgroupCurrent) {
    return {
      usage: (cgroupCurrent / cgroupMax) * 100,
      totalMb: Math.round(cgroupMax / 1024 / 1024),
      usedMb: Math.round(cgroupCurrent / 1024 / 1024),
    };
  }

  // cgroup v1 fallback
  const cgroupV1Limit = readFileNumber('/sys/fs/cgroup/memory/memory.limit_in_bytes');
  const cgroupV1Usage = readFileNumber('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  if (cgroupV1Limit && cgroupV1Limit < Number.MAX_SAFE_INTEGER) {
    return {
      usage: (cgroupV1Usage / cgroupV1Limit) * 100,
      totalMb: Math.round(cgroupV1Limit / 1024 / 1024),
      usedMb: Math.round(cgroupV1Usage / 1024 / 1024),
    };
  }

  // Fallback: use host /proc/meminfo via --pid=host mount
  const memTotal = readMeminfoValue('/host/proc/meminfo', 'MemTotal');
  const memAvailable = readMeminfoValue('/host/proc/meminfo', 'MemAvailable');
  if (memTotal && memAvailable) {
    return {
      usage: ((memTotal - memAvailable) / memTotal) * 100,
      totalMb: Math.round(memTotal / 1024),
      usedMb: Math.round((memTotal - memAvailable) / 1024),
    };
  }

  // Last resort: os module (returns host values, but better than nothing)
  const total = totalmem();
  const free = freemem();
  return {
    usage: ((total - free) / total) * 100,
    totalMb: Math.round(total / 1024 / 1024),
    usedMb: Math.round((total - free) / 1024 / 1024),
  };
}
```

### 4. Hardware Discovery: Dynamic Detection

Add a new endpoint that reads from `/host/proc/cpuinfo` and `/host/proc/meminfo`:

```typescript
// GET /v1/machines/:id/hardware
function collectHardwareInfo(): HardwareInfo {
  const cpuModel = readCpuModel('/host/proc/cpuinfo');
  const memTotalKb = readMeminfoValue('/host/proc/meminfo', 'MemTotal');
  const diskUsage = execSync('df -h /host-root', { encoding: 'utf-8' }); // host root

  const gpus = detectGpus(); // try nvidia-smi first, then lspci, then fallback

  return {
    cpuModel: cpuModel || 'Unknown',
    cpuCores: cpus().length,
    memoryTotalMb: memTotalKb ? Math.round(memTotalKb / 1024) : 0,
    gpus: gpus,  // array: [{ model, vendor }]
    diskTotalGb: parseDiskTotal(diskUsage),
    osRelease: readFirstLine('/host-root/etc/os-release') || 'Unknown',
  };
}
```

The GPU detection function:
1. Try `nvidia-smi` (will fail gracefully on non-NVIDIA systems)
2. Try `lspci | grep -i vga` for basic GPU info
3. Read `/host/proc/cpuinfo` for integrated graphics hints
4. Return `{ model: "Intel HD Graphics 630", vendor: "intel" }` or similar

### 5. Journal Log Streaming: `GET /v1/machines/:id/journal`

New endpoint that wraps `journalctl` with strict parameterization:

```
GET /v1/machines/:id/journal?unit=openclaw-gateway&lines=100&since=-1h
```

**Design decisions:**
- **Polling, not WebSocket:** Journal logs are inherently append-only and low-frequency (compared to metrics). Polling at configurable intervals (3-10s) is adequate and avoids WebSocket complexity for log tailing.
- **Parameterized for safety:** Only allow `--user` units and known service units. Never accept arbitrary `journalctl` flags from the client.
- **Capped output:** Default 100 lines, max 500. `since` parameter for time-range filtering.
- **Rate limited:** Read rate limit (60/min) applies automatically since it's a GET endpoint.

**Implementation:**

```typescript
// apps/server-kill-switch/src/routes/machines.ts
// Add to route dispatch:
const journalMatch = url.match(/^\/v1\/machines\/([^/]+)\/journal$/);
if (method === 'GET' && journalMatch) {
  const id = journalMatch[1];
  const parsed = new URL(url, 'http://localhost');
  const unit = parsed.searchParams.get('unit') || '';
  const lines = Math.min(parseInt(parsed.searchParams.get('lines') || '100', 10), 500);
  const since = parsed.searchParams.get('since') || '-1h';

  // Validate unit name: only allow alphanumeric, hyphens, dots
  if (unit && !/^[a-zA-Z0-9][a-zA-Z0-9.\-_@]+$/.test(unit)) {
    json(res, 400, { error: 'Invalid unit name' });
    return true;
  }

  const args = ['journalctl', '--no-pager', '-n', String(lines)];
  if (unit) args.push('-u', unit);
  if (since) args.push('--since', since);

  try {
    const proc = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'pipe', timeout: 5000 });
    const output = proc.stdout?.toString() || '';
    json(res, 200, {
      machineId: id,
      unit: unit || 'all',
      lines: output.split('\n').filter(Boolean).length,
      output,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    json(res, 500, { error: 'Failed to read journal', detail: err.message });
  }
  return true;
}
```

**Docker requirement:** Mount `/run/log/journal:/run/log/journal:ro` for host journal access. The kill-switch container also needs `Bun.spawnSync` capability (already present in the Bun runtime).

### 6. WebSocket Channel: `bcp:machines:metrics`

The `system-metrics.ts` already publishes to `bcp:machines:metrics`. Two gaps need fixing:

1. **WebSocketManager needs to subscribe to this channel:**
   Add `'bcp:machines:metrics'` to `REDIS_CHANNELS` array in `websocket-manager.ts`.

2. **Frontend handler needs a case for it:**
   In `use-kill-switch-websocket.ts`, add:
   ```typescript
   case 'machine-metrics': {
     const payload = (msg as unknown as { type: string; payload: MachineMetrics }).payload;
     setLatestMetrics(payload);
     break;
   }
   ```

### 7. New/Updated Endpoints Summary

| Endpoint | Method | Status | Purpose |
|----------|--------|--------|---------|
| `/v1/machines/:id/metrics` | GET | **Fix** | Delta-based CPU, cgroup-aware memory, GPU detection fallback |
| `/v1/machines/:id/hardware` | GET | **New** | Live hardware detection (CPU model, RAM, GPU, disk, OS) |
| `/v1/machines/:id/journal` | GET | **New** | Stream `journalctl` output for a given unit |
| WebSocket `machine-metrics` | WS | **Fix** | Subscribe + forward to frontend; add frontend handler |

## Consequences

### Positive

1. **Accurate metrics** — CPU shows actual utilization, memory respects cgroup limits, GPU detection handles non-NVIDIA systems gracefully.
2. **Hardware transparency** — Operators can see exactly what hardware a machine runs on (Intel vs AMD, actual RAM, integrated vs dedicated GPU).
3. **Log visibility** — System journal logs from `openclaw-gateway`, `ollama`, and other services become visible in the dashboard.
4. **Real-time metrics via WebSocket** — The existing `bcp:machines:metrics` pipe starts flowing end-to-end.
5. **No architectural churn** — Same service, same container. Just better access + better algorithms.

### Negative

1. **Reduced container isolation** — `--pid=host` and host filesystem mounts reduce the security boundary. Mitigated by read-only mounts and the observability-only nature of the service.
2. **Journal dependency** — `journalctl` requires the journal files to be on disk. On minimal Docker hosts, journal persistence may not be configured.
3. **Platform-specific paths** — `/host/proc/cpuinfo` depends on the volume mount name. If the mount path changes, hardware detection silently fails.
4. **First-run CPU spike** — The first metrics reading returns 0% CPU; dashboard shows "unavailable" for the first 5 seconds after startup.

### Neutral

1. The `MachineMetrics` type in `shared-types` gets new fields (`cpuModel`, `gpuName`, `memoryTotalMb`). Backward-compatible: all new fields are additive.
2. The `/v1/machines/:id/metrics` response shape changes (adds `cpuModel`, `gpuName`, `memoryTotalMb`). Existing consumers (`serializeMachine`) only use `cpuUsage` and `memoryUsage` — unaffected.

## Alternatives Considered

### Rejected: Host-Side Metrics Agent (Path 2)

A separate binary/process running on the host that collects metrics and pushes to Redis.

**Pros:** Cleaner container isolation, no `--pid=host`, works with any container runtime.  
**Cons:** Additional deployment artifact, another process to monitor, Redis dependency for metrics path, split logic between agent and kill-switch service.

**Why rejected:** Premature optimization. The current single-machine deployment doesn't justify the operational overhead of a separate agent. If the system scales to 10+ machines, the agent pattern becomes the right choice, and the API contract (`MachineMetrics` type + Redis channel) is already compatible.

### Rejected: WebSocket-based Journal Streaming

Streaming `journalctl -f` output through WebSocket for real-time log tails.

**Pros:** Real-time log visibility.  
**Cons:** Complex error handling (journal rotation, process crashes), message framing, backpressure. Journal logs are human-readable text — polling at 3-10s intervals is adequate for debugging and auditing. If sub-second log visibility is needed, this can be revisited.

### Rejected: Fixing `os.cpus()` Without Delta

Simply interpreting the cumulative ticks correctly (computing `(1 - idle/total) * 100`) without sampling.

**Pros:** Zero code changes.  
**Cons:** The instantaneous value is meaningless — it reflects the fraction of time spent idle since the system booted, not current utilization. On a system that's been running for weeks, this always shows near-0% or near-100% depending on workload pattern. Delta is mandatory for accurate readings.

## Implementation Plan

### Phase 1: Fix Metrics Accuracy (P0 — ~4 hours)

1. **`services/system-metrics.ts`:**
   - Replace `collectRealMetrics()` CPU calculation with delta-based algorithm
   - Replace memory calculation with cgroup-aware reading
   - Add `collectHardwareInfo()` function reading from `/host/proc/cpuinfo`
   - Add helper functions: `readFileNumber()`, `readMeminfoValue()`, `readCpuModel()`, `detectGpus()`
   - Update `MachineMetrics` interface to include `cpuModel`, `gpuName`, `memoryTotalMb`, `diskTotalGb`

2. **`services/websocket-manager.ts`:**
   - Add `'bcp:machines:metrics'` to `REDIS_CHANNELS` array
   - Add case handler in `onRedisMessage()` for channel `bcp:machines:metrics`

3. **`hooks/use-kill-switch-websocket.ts`:**
   - Add `machine-metrics` case to `handleMessage()` switch
   - Add `latestMetrics` state
   - Expose `latestMetrics` in return type

4. **`components/machines/system-metrics.tsx`:**
   - Use WebSocket `latestMetrics` data instead of inferring from `machine.specs`

5. **`docker-compose.yml`:**
   - Add `pid: "host"` to kill-switch service
   - Add volume mounts: `/sys/fs/cgroup:ro`, `/proc:/host/proc:ro`, `/:/host-root:ro`

### Phase 2: Hardware Detection Endpoint (P1 — ~2 hours)

6. **`routes/machines.ts`:**
   - Add `GET /v1/machines/:id/hardware` route handler
   - Import `collectHardwareInfo` from system-metrics

7. **`packages/shared-types/src/kill-switch.ts`:**
   - Add `HardwareInfo` interface: `{ cpuModel, cpuCores, memoryTotalMb, gpus[], diskTotalGb, osRelease }`

8. **Next.js proxy config:**
   - Verify `/api/machines/:path*` rewrite covers `*/hardware` and `*/journal`

### Phase 3: Journal Log Streaming (P1 — ~2 hours)

9. **`routes/machines.ts`:**
   - Add `GET /v1/machines/:id/journal` route handler with `journalctl` spawn
   - Validate `unit` parameter (regex: `[a-zA-Z0-9.\-_@]+`)

10. **`docker-compose.yml`:**
    - Add volume mount: `/run/log/journal:/run/log/journal:ro`

11. **`components/machines/machine-logs.tsx`:**
    - Add journal log polling (3-10s interval) to fetch from new endpoint
    - Display journal output alongside audit entries

### Phase 4: Frontend Integration (P1 — ~2 hours)

12. **`components/machines/machine-detail-panel.tsx`:**
    - Update StatCard values to use real-time WebSocket metrics
    - Add journal log section below audit log

13. **`components/machines/machine-sidebar.tsx`:**
    - Show live-detected hardware info (CPU model, RAM, GPU) instead of `machine.specs`

### Dependencies & Ordering

```
Phase 1 (metrics fix) ── independent, start immediately
    │
    ├── Phase 2 (hardware endpoint) ── depends on collectHardwareInfo()
    │
    └── Phase 3 (journal) ── independent of Phase 2, can run in parallel
         │
         └── Phase 4 (frontend) ── depends on all above
```

## References

- [system-metrics.ts](../../apps/server-kill-switch/src/services/system-metrics.ts) — Current metrics implementation (broken)
- [websocket-manager.ts](../../apps/server-kill-switch/src/services/websocket-manager.ts) — Redis channel subscriptions
- [use-kill-switch-websocket.ts](../../apps/web-regulator/hooks/use-kill-switch-websocket.ts) — Frontend WebSocket handler
- [machine-logs.tsx](../../apps/web-regulator/components/machines/machine-logs.tsx) — FE log viewer (audit only)
- [system-metrics.tsx](../../apps/web-regulator/components/machines/system-metrics.tsx) — FE metrics panel
- [docker-compose.yml](../../docker-compose.yml) — Current container configuration
- [ADR-133](./ADR-133-kill-switch-protocol.md) — Kill Switch protocol (accepted, 2026-05-13)
- [KILL-SWITCH-SYSTEM-DESIGN.md](../KILL-SWITCH-SYSTEM-DESIGN.md) — Full system design v2.0.0
