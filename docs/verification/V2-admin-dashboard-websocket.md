# V2 — Admin Dashboard (real-time WebSocket)

**Claim:** Whitepaper v1.5 §2.5 — admin dashboard with real-time WebSocket deployed.
**Status:** ⚠️ PENDING — requires Better-Auth admin session
**Verifier:** Volthiz (QA) — 2026-09-08 12:45 CST

## What was attempted

- `GET http://localhost:3000/` → `{"error":"Authentication required"}` (dashboard is auth-gated)
- `GET http://localhost:3001/` → Next.js dashboard HTML served (web-regulator on 3001), but all API calls require a session cookie.
- No admin credentials available to this agent (card context: "V2, V3, V6: requieren sesión Better-Auth admin (dashboard)").

## Evidence of deployment (partial)

- Web-regulator container `alygn-web-regulator` Up 5 days (healthy), serving on 3001.
- WebSocket manager present in source: `apps/server-kill-switch/src/services/websocket-manager.ts` (pub/sub on state change → WS broadcast).
- Kill-switch publishes state transitions to Redis pub/sub (`PUBSUB_CHANNEL`) — verified in `transitionTo` (Redis `publish` call).

## Blocked on

1. **Better-Auth admin credentials** for the live deployment (or a test admin account) — from Andler.
2. Then: browser session → dashboard renders → WS connects → state change propagates <100ms (WS frame capture).

## Verdict

**V2: PENDING — "deployed (pending verification)".** Dashboard + WS infrastructure confirmed present and running; end-to-end propagation evidence requires admin session.
