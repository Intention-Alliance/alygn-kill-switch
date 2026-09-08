# V3 — Per-Machine Flags + Resolution Order

**Claim:** Whitepaper v1.5 §2.5 — per-machine flags with override precedence deployed.
**Status:** ⚠️ PARTIALLY VERIFIED — flag CRUD live; override precedence test needs admin session
**Verifier:** Volthiz (QA) — 2026-09-08 12:47 CST

## Evidence

### 1. Global flags live (8 seeded)

```bash
$ curl -s -H "x-api-key: $KILL_SWITCH_API_KEY" http://localhost:3000/v1/flags
{"flags":[
  {"id":"flag-interception-enabled","key":"interception_enabled","value":true,"enabled":true,"createdBy":"system","createdAt":"2026-08-25T05:01:23.000Z"},
  {"id":"flag-auto-stop-threshold","key":"auto_stop_threshold","value":true,...},
  {"id":"flag-damage-logging-level","key":"damage_logging_level","value":true,...},
  {"id":"flag-alert-on-critical","key":"alert_on_critical_score","value":true,...},
  {"id":"flag-sampling-rate","key":"sampling_rate","value":true,...},
  {"id":"flag-kill-auth-mode","key":"kill.authorization.mode","value":true,...},
  {"id":"flag-kill-auth-quorum","key":"kill.authorization.quorum","value":true,...},
  {"id":"flag-kill-auth-timeout","key":"kill.authorization.timeoutMs","value":true,...}
]}
```

### 2. Per-machine flags live (seeded at admission, ADR-138 §4)

```bash
$ curl -s -H "x-api-key: $KILL_SWITCH_API_KEY" http://localhost:3000/v1/machines/andlersrv-local/status
{"machine":{"id":"andlersrv-local","name":"andlersrv","status":"active","lastSeen":"2026-09-08T18:41:33.000Z"},
 "dpu":{"available":false,...},
 "agents":[],
 "activeFlags":[
   {"key":"interception_enabled","value":"true","source":"machine","machineId":"andlersrv-local"},
   {"key":"auto_stop_threshold","value":"true","source":"machine","machineId":"andlersrv-local"},
   ... 8 flags total, all source:"machine"
 ]}
```

### 3. Resolution order (code-verified)

`apps/server-kill-switch/src/routes/machines.ts` `GET /v1/machines/:id/status`:
1. Load machine-specific `machine_flag` rows.
2. Load global `feature_flag` rows.
3. Merge: **machine override takes precedence** (`mf.value ?? String(gf.value)`, `source: 'machine'`).
4. Machine-only flags (not in global) appended with `source: 'machine'`.

DB state confirms seeding: `machine_flag` has 8 rows for `andlersrv-local` (all `value='true'`), matching the 8 global flags.

## Blocked on

- **Override precedence test** (set machine flag ≠ global, verify machine wins) requires authenticated flag-write API (admin session).
- **Flag CRUD via API** (POST/PATCH) requires admin session.

## Verdict

**V3: PARTIAL — flag read path + resolution-order code verified live; write path + precedence test pending admin credentials.**
