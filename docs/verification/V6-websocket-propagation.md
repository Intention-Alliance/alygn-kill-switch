# V6 — WebSocket Real-Time Propagation

**Claim:** Whitepaper v1.5 §2.5 — WebSocket real-time state propagation deployed.
**Status:** ⚠️ PENDING — requires Better-Auth admin session (dashboard WS)
**Verifier:** Volthiz (QA) — 2026-09-08 12:57 CST

## Evidence of deployment (partial)

- `apps/server-kill-switch/src/services/websocket-manager.ts` — WS manager present in source.
- Redis pub/sub channel wired: `transitionTo` publishes `{previousState, newState, timestamp, traceId, initiatedBy, reason}` to `PUBSUB_CHANNEL` on every transition (verified in code).
- `subscribeToStateChanges` / `onStateChange` listeners registered in service.
- Dashboard (web-regulator, port 3001) consumes WS for live state display — requires session to observe.

## Blocked on

1. **Better-Auth admin credentials** (or test admin account) — from Andler.
2. Then: WS client test with auth → state change → frame received <100ms without polling.

## Verdict

**V6: PENDING — "deployed (pending verification)".** Pub/sub + WS infrastructure confirmed in code and running; end-to-end latency evidence requires admin session.
