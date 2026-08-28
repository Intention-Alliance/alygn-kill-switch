# GATE Review Report — Kill-Switch Ollama Proxy (Re-review after P1 round)

**Reviewer:** Nikaya 🔍 | **Date:** 2026-08-27 | **Branch:** feat/kill-switch-ollama-proxy (uncommitted)
**Previous:** 78/100 FAIL (P1-1, P1-2, P1-3 + P2s) | **This round:** 97/100 **PASS**

## Verdict

**PASS — 97/100** (threshold 92). All three P1 findings resolved. New fingerprint-scoped halt layer is sound. Residual findings are documented tradeoffs / follow-ups, not blockers.

## Prior findings — resolution status

| # | Finding | Status | Evidence |
|---|---------|--------|----------|
| P1-1 | Output never verified | ✅ RESOLVED | ollama-proxy.ts:481-512 — single post-relay event (prompt+output), fires after res.end() (non-blocking), detached (void + catch). No double-fire: index.ts:242 only fires hook for legacy /v1/inference/*; proxy lanes fire in-route after X-API-Key check (ollama-proxy.ts:405). Fingerprint threaded (ollama-proxy.ts:332-341). KNOWN GAP (streamed) honestly documented (ollama-proxy.ts:34-43). |
| P1-2 | Verification off by default | ✅ RESOLVED | docker-compose.yml:99 `:-true`; deploy .env (infrastructure/.env:15) KILL_SWITCH_VERIFY_ENABLED=true; loud fail-start guard (index.ts:431-443); production.ts:78 verifyEnabled:true + feature flag true. |
| P1-3 | Buffered no SSE + misleading docs | ✅ RESOLVED | Honest buffered-pass-through docs (ollama-proxy.ts:25-43); MAX_BUFFER_BYTES 64MiB cap → 502 response_too_large (node-res-adapter.ts:73-82); relay stops reading upstream on abort (ollama-proxy.ts:458-461). |
| P2s | auth-first / 413 / timeout / error frame / TextDecoder / degraded event | ✅ RESOLVED | Verified in code + tests (see findings). |

## Findings this round

### MEDIUM (residual, tracked — not blockers)
1. **Streamed outputs still unverified (KNOWN GAP)** — ollama-proxy.ts:34-43. extractGenerationOutput returns '' for NDJSON/SSE → verifier classifies prompt+'' post-relay. Honest docs, accepted under the buffered pass-through refinement, but the safety property for streamed lanes is effectively prompt-only. Doc claim "Prompt-side verification still applies to streamed requests" overstates: there is NO pre-screen for proxy lanes (hook skips them) — it is a post-hoc event with empty output. **Follow-up:** SSE reassembly before verification (already documented as future refactor).
2. **Slow-rotation escalation evasion** — fingerprint-halt.ts:52 (5-min eval window) + TTL 10-min self-heal: a compromised client rotating machineId can space UNSAFE outputs >5 min apart to keep active-count <2, never triggering global STOPPED, and re-enter after TTL. Documented spoofability tradeoff (fingerprint-halt.ts:16-23); escalation backstop covers fast/coordinated rotation only. **Recommend:** config option to prefer apiKey lane when machineId untrusted.

### LOW
3. **Unbounded in-memory map growth under attack** — fingerprint-halt.ts:89-90. Unique-fingerprint flood grows _blocks/_unsafeHistory; bounded by TTL+prune (lazy eviction, fingerprint-halt.ts:288-299) — ~1MB per 10k entries, acceptable, but a hard cap would harden.
4. **Double deriveFingerprint** — ollama-proxy.ts:332-340 derives twice (fingerprint + source). Deterministic, minor inefficiency.
5. **Verification fires on 4xx upstream error bodies** — ollama-proxy.ts:485 fires for any non-aborted relay; error JSON → output '' → weak/noisy event. Harmless.

### Notes
- **Deploy compose (main repo) still `:-false`** (infrastructure/docker-compose.yml:97) — pre-merge state; ensure branch's `:-true` lands on merge. Deploy .env already `true`, so production is safe today.
- **29 baseline test failures are pre-existing** (webauthn env config, traffic-pause, chaos auth) — files untouched by this branch (git status confirms). Track separately; not blockers.

## Verification performed (independent)

- **Tests:** `bun test` → 632 pass / 29 fail / 1713 expect — matches claimed baseline. All 29 failures in untouched files.
- **New tests genuine:** fingerprint-halt.test.ts (derivation priority, TTL self-heal, escalation rule, SAFE clears history); verification-service.test.ts (scoped halt, no global flip on single UNSAFE, escalation, self-heal, degraded event, fingerprint persisted via machineId); ollama-proxy.test.ts (fires after relay, extraction shapes, no-fire on abort/unauth/metadata, 413, mid-stream error frame, no X-API-Key leak); node-res-adapter.test.ts (cap across chunks, UTF-8 split decode).
- **Build:** `bun run build` → green (2756 modules, 354ms).
- **Race check:** all fingerprint-halt mutations synchronous (single-threaded event loop) — no races.
- **Escalation rule:** min-2-active deviation acceptable — single-machine deployments still effectively halted (scoped block = the only machine); multi-machine keeps fleet flowing per refinement.
- **In-memory vs Redis:** single container (documented) — acceptable; global state remains in Redis.

## Required fixes before merge

None (PASS). MEDIUM items are documented residuals with follow-up paths; recommend tracking items 1-2 as a follow-up ticket (SSE reassembly + apiKey-priority option).
