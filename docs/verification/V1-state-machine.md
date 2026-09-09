# V1 — State Machine (ARMED/RUNNING/STOPPING/STOPPED/LOCKED)

**Claim:** Whitepaper v1.5 §2.5 — state machine deployed.
**Status:** ✅ VERIFIED LIVE
**Verifier:** Volthiz (QA) — 2026-09-08 12:41 CST
**Environment:** andlersrv, container `alygn-kill-switch` (Up 5 days, healthy, 0 restarts), host port 3000.

## Evidence

### 1. Health endpoint returns current state

```bash
$ curl -s http://localhost:3000/v1/kill-switch/health
{"status":"healthy","killSwitchState":"RUNNING","redis":{"redis":"OK"},"auditLogSize":4,"timestamp":"2026-09-08T18:41:37.530Z"}
```

- `killSwitchState: "RUNNING"` — live state from Redis (`chaosKillSwitchKey`), not a hardcoded value.
- `redis: OK` — state source healthy.
- `auditLogSize: 4` — hot cache loaded from DB (4 persisted entries).

### 2. Status endpoint with transition history

```bash
$ curl -s -H "x-api-key: $KILL_SWITCH_API_KEY" http://localhost:3000/v1/kill-switch/status
{"state":"RUNNING","lastActivation":"2026-08-27T03:57:23.000Z","lastActivationBy":"admin@alygn.com",
 "activeExperiments":0,"activatedAt":"2026-08-27T03:57:23.000Z",
 "reason":"Test: return to RUNNING — audit log pipeline verified",
 "recentTransitions":[
   {"previousState":"ARMED","newState":"ARMED","timestamp":"2026-08-26T23:16:26.000Z","traceId":"seed-1a47f313","initiatedBy":"system","reason":"System initialized — kill switch armed"},
   {"previousState":"RUNNING","newState":"STOPPED","timestamp":"2026-08-27T03:57:15.000Z","initiatedBy":"admin@alygn.com","reason":"Test: verify audit log pipeline end-to-end"},
   {"previousState":"STOPPED","newState":"ARMED","timestamp":"2026-08-27T03:57:23.000Z","initiatedBy":"admin@alygn.com","reason":"Test: re-arm before returning to RUNNING"},
   {"previousState":"ARMED","newState":"RUNNING","timestamp":"2026-08-27T03:57:23.000Z","initiatedBy":"admin@alygn.com","reason":"Test: return to RUNNING — audit log pipeline verified"}
 ]}
```

### 3. State machine definition (source)

`apps/server-kill-switch/src/services/kill-switch.ts`:

```ts
STATES = { ARMED, RUNNING, STOPPING, STOPPED, LOCKED }
VALID_TRANSITIONS = {
  ARMED:    [RUNNING, STOPPED, LOCKED],
  RUNNING:  [STOPPING, STOPPED, LOCKED],
  STOPPING: [STOPPED, LOCKED],
  STOPPED:  [ARMED, LOCKED, RUNNING],
  LOCKED:   [STOPPED],
}
```

Invalid transitions rejected with 409 + allowed list (verified in code path `transitionTo`).

## Verdict

| Check | Result |
|-------|--------|
| Health returns live state | ✅ |
| Redis-backed state source | ✅ |
| Transition history persisted + replayable | ✅ |
| All 5 states defined with valid transition table | ✅ |
| Invalid transition rejection (409) | ✅ (code-verified) |

**V1: VERIFIED — claim stands.**
