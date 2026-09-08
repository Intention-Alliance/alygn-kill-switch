# V4 — Hardware Detection (CPU/memory/GPU/disk/OS)

**Claim:** Whitepaper v1.5 §2.5 — hardware detection with machine fingerprint deployed.
**Status:** ✅ VERIFIED LIVE (single machine) — drift detection needs second machine
**Verifier:** Volthiz (QA) — 2026-09-08 12:50 CST

## Evidence

### 1. Full hardware fingerprint captured (andlersrv-primary, ADMITTED today)

```bash
$ curl -s -H "x-api-key: $KILL_SWITCH_API_KEY" http://localhost:3000/v1/discovery/machines
{"data":[
  {"id":"andlersrv-primary","hostname":"andlersrv.tail62d797.ts.net","ip":null,"source":"heartbeat","state":"ADMITTED",
   "fingerprint":{
     "cpuModel":"Intel(R) Core(TM) i5-7500T CPU @ 2.70GHz",
     "cpuCores":4,
     "memoryMb":15865,
     "gpus":[{"name":"00:02.0 VGA compatible controller [0300]: Intel Corporation HD Graphics 630  (rev 04)","vendor":null,"pciId":"8086:5912"}],
     "diskGb":236,
     "osRelease":"Alpine Linux v3.20",
     "macs":["f6:bc:d9:82:3c:b0"],
     "collectedAt":"2026-09-08T17:12:04.285Z"},
   "integritySignature":{"algorithm":"sha256","hash":"08e5aa022a8fd85b20a2dfaecd04d4b3583d9321665fafb0c1636f5c7c57f3a6","signedAt":"2026-09-08T17:12:04.285Z"},
   "firstSeen":"2026-09-08T17:11:52.000Z","lastSeen":"2026-09-08T17:12:04.000Z",
   "confirmedAt":"2026-09-08T17:12:04.000Z","confirmedBy":"admin@alygn.com"},
  {"id":"andlersrv-agent-test","hostname":"andlersrv.tail62d797.ts.net","source":"heartbeat","state":"DENIED", ...same fingerprint...}
]}
```

### 2. Machine inventory with live metrics

```bash
$ curl -s -H "x-api-key: $KILL_SWITCH_API_KEY" http://localhost:3000/v1/machines
{"data":[{"id":"andlersrv-local","name":"andlersrv","hostname":"andlersrv.tail62d797.ts.net","status":"active","role":"primary",
  "specs":{"cpu":"Intel(R) Core(TM) i5-7500T CPU @ 2.70GHz","ram":"15865MB","gpu":"Intel Corporation HD Graphics 630","dpu":null},
  "cpuUsage":7.15,"memoryUsage":68.56,"connected":true,"monitoringOnly":true,"zone":"unassigned"}],"total":1}
```

- CPU model, cores, RAM, GPU (with PCI ID), disk, OS release, MACs — all captured.
- SHA-256 integrity signature computed + signed at collection time.
- Live `cpuUsage`/`memoryUsage` metrics on the inventory endpoint.

### 3. Drift detection (code-verified)

`apps/server-kill-switch/src/services/discovery/` — heartbeat path compares incoming fingerprint vs stored; mismatch → `INTEGRITY_DRIFT` state + `onboarding.integrity-drift` audit entry (HIGH severity, re-confirmation required per ADR-138 §4). `integrity_event` table exists (0 rows — no drift observed yet).

## Blocked on

- **Drift simulation** (modify hardware → observe alert) requires a second machine or agent with mutable fingerprint.

## Verdict

**V4: VERIFIED (fingerprint collection + integrity signing live on andlersrv). Drift-detection firing test pending second machine.**
