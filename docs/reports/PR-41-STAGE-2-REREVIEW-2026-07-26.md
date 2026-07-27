## Stage 2 Re-Review — Card 0e2f9fec (PR #41)

**Reviewer:** reviewer (Stage 2 RULES.md §7, re-review)
**Commit under review:** c3bf19e (parent: 648dfb7)
**Scope:** F2-F9 (F1 already verified at 3f342fe6)
**Date:** 2026-07-26 20:05 CST

---

## Verdict: FAIL — 90.0/100 (threshold ≥92)

### Per-Finding Score

| Finding | Status | Evidence |
|---------|--------|----------|
| F2 | PASS | `apps/server-kill-switch/src/index.ts` Bun.serve call contains `hostname: '127.0.0.1'` at line ~170 of the c3bf19e tree. Comment: "bind to loopback only so /v1/internal/* endpoints are not reachable from sibling containers." Verified by live `git show c3bf19e:apps/server-kill-switch/src/index.ts`. |
| F3 | PASS | `apps/server-kill-switch/src/services/hashing.ts:74-76` — `generateApiKey()` now uses `const hex = randomBytes(32).toString('hex').slice(0, 48)` returning `wk_${hex}`. 48 hex chars = 192 bits of entropy (spec §6 requires 190-bit min). No `padEnd` or 'A' padding. Tests in `hashing.test.ts` assert: (1) `wk_` prefix, (2) length 51, (3) all chars after `wk_` are hex (`/^[0-9a-f]+$/`), (4) 1000 successive calls produce no duplicates. |
| F4 | PASS | `apps/web-regulator/app/(dashboard)/admin/api-keys/actions.ts:65-68` — `isMockMode()` now returns `process.env.NODE_ENV !== 'production' && !ADMIN_UI_API_KEY`. In production, returns `false` regardless of key presence. Tests in `actions.test.ts` verify: (1) production + no key → false, (2) production + empty key → false, (3) development + no key → true, (4) development + key → false, (5) unset NODE_ENV + no key → true. |
| F5 | PASS | `apps/server-kill-switch/scripts/create-admin-key.ts:64-69` — `chmodSync(dbPath, 0o640)` applied to `data/kill-switch.sqlite` during bootstrap, wrapped in try/catch with warn on failure. Path resolved via `join(import.meta.dir, '..', 'data', 'kill-switch.sqlite')`. |
| F6 | FAIL | `apps/server-kill-switch/src/middleware/apikey.middleware.ts` — the c3bf19e diff adds `prefix: rawKey.slice(0, 8)` to the `malformed` (line 106) and `unknown` (line 120) audit entries. However: (1) `path:` (request URL/path) was NOT added to any audit meta JSON — the original finding required BOTH `prefix:` AND `path:`. (2) No test case in `api-keys.test.ts` asserts prefix logging on unknown keys — the acceptance criterion explicitly required "a test case asserting prefix logging on unknown keys." The test file tests route handlers, not the `verifyApiKey` audit output. |
| F7 | PASS | `apps/server-kill-switch/package.json:15` — test script now reads: `"bun test src/lib/secrets-loader.test.ts src/lib/lockout-state.test.ts src/lib/admin-secrets.test.ts src/routes/__tests__/api-keys.test.ts src/services/__tests__/hashing.test.ts"`. Both `api-keys.test.ts` and `hashing.test.ts` are listed. (`secure-compare.test.ts` does not exist as a file, but the acceptance OR condition is satisfied by adding the new test files.) |
| F8 | PASS | `apps/server-kill-switch/src/routes/api-keys.ts:75-96` — `checkInternalRateLimit(ip)` with `INTERNAL_RATE_LIMIT_MAX = 10` and `INTERNAL_RATE_LIMIT_WINDOW_MS = 60_000` (10 req/min per IP). Applied at lines 504-505 (`/v1/internal/api-keys/lookup`) and 510-511 (`/v1/internal/api-keys/verify`) in the dispatcher, AFTER `internalKeyMatches` auth check. In-memory sliding window since internal endpoints are localhost-only. |
| F9 | FAIL | `apps/server-kill-switch/src/routes/api-keys.ts:283-340` — `rotateKey()` now wraps SELECT + UPDATE + INSERT inside `db.transaction(async (tx) => { ... })`. The `tx.query.webhookApiKeys.findFirst` (SELECT) is inside the transaction. A `revokedAt` check inside the transaction returns 409 if already revoked. This satisfies the code-fix portion (SELECT inside transaction). HOWEVER: the acceptance criterion explicitly required "AND a test asserting concurrent rotations don't double-insert." The test file has `rotateKey: 409 on already-revoked key` (sequential, not concurrent) — no test simulates two concurrent rotation calls to verify the transaction prevents double-insert. |

### Total: 90.0/100 — FAIL

### PASS Conditions (all must be true)
- All 8 findings marked PASS ❌ (F6 and F9 FAIL)
- All evidence cites specific file:line and exact code/grep output ✅
- No "looks good" without byte-level proof ✅

### FAIL Conditions (any one fails the re-review)
- ✅ Any finding marked FAIL with specific gap: F6 (missing `path:` in meta + missing test), F9 (missing concurrent rotation test)
- ✅ Evidence cited from live read of c3bf19e tree (not commit message)
- ✅ Any test case missing that the original review required: F6 prefix test, F9 concurrent test

---

## Files Read (from c3bf19e tree via `git show`)

- `apps/server-kill-switch/src/index.ts` — F2 hostname, F8 dispatch order ✅
- `apps/server-kill-switch/src/services/hashing.ts` — F3 entropy ✅
- `apps/server-kill-switch/scripts/create-admin-key.ts` — F5 chmod ✅
- `apps/server-kill-switch/src/middleware/apikey.middleware.ts` — F6 meta (diff checked) ✅
- `apps/server-kill-switch/src/routes/api-keys.ts` — F8 rate limit, F9 transaction ✅
- `apps/server-kill-switch/src/services/__tests__/hashing.test.ts` — F3 tests ✅
- `apps/server-kill-switch/src/routes/__tests__/api-keys.test.ts` — F6/F9 tests ✅
- `apps/web-regulator/app/(dashboard)/admin/api-keys/actions.ts` — F4 isMockMode ✅
- `apps/web-regulator/app/(dashboard)/admin/api-keys/actions.test.ts` — F4 tests ✅
- `apps/server-kill-switch/package.json` — F7 test script ✅

## Gaps to Close for Next Re-Review

1. **F6 (MEDIUM):** Add `path: req.url` (or equivalent request path) to the audit meta JSON in `apikey.middleware.ts` for all failure cases (missing, malformed, unknown, hash_mismatch, revoked, expired, scope_mismatch). Add a unit test that calls `verifyApiKey` with an unknown key and asserts the audit entry contains both `prefix:` and `path:`.
2. **F9 (MEDIUM):** Add a test that simulates two concurrent calls to `rotateKey` for the same key ID (e.g., `Promise.all([rotateKey(res, id), rotateKey(res2, id)])`) and asserts only one succeeds (201) while the other fails (409), confirming the transaction prevents double-insert.

Report by Nikaya 🔍