# V9 — Registration Lifecycle (NEW_MACHINE → ADMITTED/DENIED)

**Claim:** Whitepaper v1.5 §2.5 — registration lifecycle deployed.
**Status:** ✅ VERIFIED LIVE (approve + deny flows, audit trail)
**Verifier:** Volthiz (QA) — 2026-09-08 13:05 CST (validating Wobblus's 11:11 CST run)

## Evidence

### 1. Full lifecycle observed today (2026-09-08)

**Approve flow** — `andlersrv-primary`:
1. `POST /v1/discovery/heartbeat` → machine enters `NEW_MACHINE` (firstSeen 17:11:52)
2. Fingerprint + integrity signature collected (17:12:04)
3. Admin approve → `ADMITTED`, confirmedBy `admin@alygn.com` (17:12:04)
4. Registration request recorded `APPROVED`
5. Managed machine tenant created (`machine` row, monitoring-only, zone unassigned)
6. 8 tenant flags seeded from org defaults
7. Audit entry `onboarding.approve` written

**Deny flow** — `andlersrv-agent-test`:
1. Heartbeat → `NEW_MACHINE`
2. Admin deny → `DENIED` (17:11:19)
3. Registration request recorded `DENIED`
4. Audit entry `onboarding.deny` written (severity medium)

### 2. Live API state

```bash
$ curl -s -H "x-api-key: $KILL_SWITCH_API_KEY" http://localhost:3000/v1/discovery/machines
# andlersrv-primary: state=ADMITTED, confirmedAt/confirmedBy populated
# andlersrv-agent-test: state=DENIED, confirmedAt/confirmedBy populated

$ curl -s -H "x-api-key: $KILL_SWITCH_API_KEY" http://localhost:3000/v1/onboarding/pending
{"data":[],"total":0}   # no pending — both decisions made
```

### 3. Audit trail (DB, append-only)

| # | timestamp | actor | reason | prev → new | machine |
|---|-----------|-------|--------|-----------|---------|
| 5 | 1788887479 | admin@alygn.com | onboarding.deny | NEW_MACHINE → DENIED | andlersrv-agent-test |
| 6 | 1788887524 | admin@alygn.com | onboarding.approve | NEW_MACHINE → ADMITTED | andlersrv-primary |

Registration requests table: 2 rows (APPROVED + DENIED), both reviewed by admin@alygn.com.

## Verdict

| Check | Result |
|-------|--------|
| NEW_MACHINE → ADMITTED (approve) | ✅ live |
| NEW_MACHINE → DENIED (deny) | ✅ live |
| Registration request recorded both ways | ✅ |
| Managed tenant + flags seeded on approve | ✅ |
| Audit entries for both decisions | ✅ |
| Rogue alert on repeat deny | ⚠️ threshold=3; only 1 deny so far (see V10) |

**V9: VERIFIED — claim stands.**
