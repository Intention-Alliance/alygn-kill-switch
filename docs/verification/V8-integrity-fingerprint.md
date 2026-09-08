# V8 — Hardware Integrity Fingerprint + Tamper Detection

**Claim:** Whitepaper v1.5 §2.5 — hardware integrity fingerprint with tamper detection deployed.
**Status:** ⚠️ PARTIALLY VERIFIED — fingerprint + signature live; tamper-event firing pending second machine
**Verifier:** Volthiz (QA) — 2026-09-08 13:02 CST

## Evidence

### 1. Integrity fingerprint + SHA-256 signature live

From `GET /v1/discovery/machines` (andlersrv-primary, ADMITTED):

```json
"fingerprint":{
  "cpuModel":"Intel(R) Core(TM) i5-7500T CPU @ 2.70GHz",
  "cpuCores":4,
  "memoryMb":15865,
  "gpus":[{"name":"...HD Graphics 630...","vendor":null,"pciId":"8086:5912"}],
  "diskGb":236,
  "osRelease":"Alpine Linux v3.20",
  "macs":["f6:bc:d9:82:3c:b0"],
  "collectedAt":"2026-09-08T17:12:04.285Z"},
"integritySignature":{
  "algorithm":"sha256",
  "hash":"08e5aa022a8fd85b20a2dfaecd04d4b3583d9321665fafb0c1636f5c7c57f3a6",
  "signedAt":"2026-09-08T17:12:04.285Z"}
```

- Fingerprint covers CPU (model+cores), RAM, GPU (PCI ID), disk, OS, MACs.
- SHA-256 signature computed at collection time.

### 2. Drift detection path (code-verified)

- Heartbeat handler compares incoming fingerprint vs stored → mismatch sets `drift: true`, response `state: "INTEGRITY_DRIFT"`.
- `onboarding.integrity-drift` audit entry (severity HIGH, "re-confirmation required (ADR-138 §4)") written on drift.
- `integrity_event` table exists (0 rows — no drift observed in 5 days of uptime, which is the expected steady state).

### 3. Fingerprint stability

Both heartbeats today (andlersrv-primary 17:12:04, andlersrv-agent-test 17:11:02) produced the **identical** SHA-256 hash `08e5aa02...` — fingerprint is stable across collections on the same hardware. ✅

## Blocked on

- **Tamper simulation** (modify hardware/fingerprint → verify drift event + alert fires) requires a second machine or a fingerprint-mutable agent.

## Verdict

**V8: PARTIAL — fingerprint baseline + signature + stability verified live. Tamper-event firing test pending second machine.**
