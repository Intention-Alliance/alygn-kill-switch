# V10 — Rogue Device Alerting + Monitoring-Only Default

**Claim:** Whitepaper v1.5 §2.5 — rogue device alerting + monitoring-only default deployed.
**Status:** ⚠️ PARTIALLY VERIFIED — deny flow + monitoring-only live; rogue alert firing pending 3rd deny
**Verifier:** Volthiz (QA) — 2026-09-08 13:08 CST

## Evidence

### 1. Monitoring-only default verified live

```bash
$ curl -s -H "x-api-key: $KILL_SWITCH_API_KEY" http://localhost:3000/v1/machines
{"data":[{"id":"andlersrv-local",...,"monitoringOnly":true,"zone":"unassigned"}]}
```

- `monitoringOnly: true` on the admitted tenant (ADR-138: no authority granted at admission).
- Code: `onboarding.ts` approve path hardcodes `monitoringOnly: true` + `zone: DEFAULT_ZONE`.

### 2. Deny flow live (rogue pre-cursor)

- `andlersrv-agent-test` denied today → `DENIED` state, audit entry written.
- `rogue_device_alert` table: **0 rows** — expected: `ROGUE_ALERT_DENIAL_THRESHOLD = 3` (code-verified in `onboarding.ts`), only 1 denial so far.

### 3. Rogue alert path (code-verified)

`onboarding.ts` deny flow:
1. Count denials for hostname/IP (`state='DENIED'`).
2. If `>= 3` → upsert `rogue_device_alert` (denialCount, lastDeniedAt, resolved=false).
3. Audit entry severity escalates: `rogueAlertId ? 'high' : 'medium'`.
4. `GET /v1/onboarding/rogue-alerts` returns alerts (currently `{"data":[],"total":0}`).

### 4. Zero-authority for unregistered devices (code-verified)

- Discovery sweep: "NO auto-admission: discovered machines enter NEW_MACHINE and require human confirmation (ADR-135 §5)" — response note in `POST /v1/discovery/sweep`.
- 11 machines sit in `NEW_MACHINE` (arp-sweep discoveries) with **zero** authority — no tenant, no flags, no access.

## Blocked on

- **Rogue alert firing test** (3rd deny from same hostname) requires a second machine (andlerlnx/andler-mini) or repeat-denial simulation.

## Verdict

**V10: PARTIAL — monitoring-only default + deny flow + zero-authority verified live. Rogue alert firing (threshold 3) pending second machine.**
