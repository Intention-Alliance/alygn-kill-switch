# PR #41 — Stage 2 Final Review (F6 + F9 Verification)

**Reviewer:** reviewer (Nikaya 🔍)
**Date:** 2026-07-26 20:14 CST
**Commit under review:** 30d0c5e (parent: e07b442)
**Scope:** F6 + F9 verification (F1-F5, F7, F8 already verified PASS at c3bf19e)
**Cycle:** 3 of 3 (Stage 2 RULES.md §7 — max cycles reached)

## Verdict: PASS — 92/100 (threshold ≥92)

### F6 — Audit path capture: PASS

**Evidence (all byte-level, file:line):**

- `src/middleware/apikey.middleware.ts` — `path: requestPath ?? null` present in **8 audit branches** (lines 104, 113, 128, 141, 150, 158, 172, 182):
  - Line 104: `missing` branch ✅
  - Line 113: `malformed` branch (with `prefix: rawKey.slice(0, 8)`) ✅
  - Line 128: `unknown_prefix` branch (with `prefix: rawKey.slice(0, 8)`) ✅
  - Line 141: `hash_mismatch` branch ✅
  - Line 150: `revoked` branch ✅
  - Line 158: `expired` branch ✅
  - Line 172: `scope_mismatch` branch ✅
  - Line 182: success (`use`) branch ✅
- `src/middleware/apikey.middleware.ts` line 58: `audit()` function signature accepts `webhookPath?: string | null` parameter
- `src/middleware/apikey.middleware.ts` line 67: `webhookPath: webhookPath ?? null` written to DB column
- `src/db/schema.ts` line ~382: `webhookPath: text('webhook_path')` column in `webhookApiKeyAudit` table ✅
- `drizzle/0002_smooth_the_fury.sql`: `ALTER TABLE webhook_api_key_audit ADD webhook_path text;` ✅
- Tests in `src/routes/__tests__/api-keys.test.ts`:
  - Line ~570: "unknown prefix audit includes prefix and path" — asserts `meta.reason === 'unknown_prefix'`, `meta.prefix === fakeKey.slice(0,8)`, `meta.path === '/v1/internal/api-keys/verify'`, `audit.webhookPath === '/v1/internal/api-keys/verify'` ✅
  - Line ~593: "malformed key audit includes prefix and path" — asserts `meta.reason === 'malformed'`, `meta.prefix === shortKey.slice(0,8)`, `meta.path === '/v1/internal/api-keys/verify'`, `audit.webhookPath === '/v1/internal/api-keys/verify'` ✅
  - Line ~616: "missing key audit includes path" — asserts `meta.reason === 'missing'`, `meta.path === '/v1/internal/api-keys/verify'`, `audit.webhookPath === '/v1/internal/api-keys/verify'` ✅

### F9 — Concurrent rotation: PASS

**Evidence (all byte-level, file:line):**

- `src/routes/api-keys.ts` lines 233-285: `rotateKey` body wrapped in `db.transaction(async (tx) => {...})` ✅
- Line 238: SELECT inside transaction via `tx.query.webhookApiKeys.findFirst({ where: eq(webhookApiKeys.id, id) })` ✅
- Line 244: revoked check inside transaction (`if (existing.revokedAt)` → 409) ✅
- Test in `src/routes/__tests__/api-keys.test.ts` line ~648: `Promise.all([handleApiKeysRoutes(..., rotateReq1, ...), handleApiKeysRoutes(..., rotateReq2, ...)])` ✅
- Assertions in test:
  - `successCount === 1` (exactly one 201) ✅
  - `conflictCount === 1` (exactly one 409) ✅
  - `keysAfter - keysBefore === 1` (only +1 row inserted, not +2) ✅
  - `rotateAudits.length === 1` (only one rotate audit event for oldId) ✅

### Test Run

```
bun test src/ src/middleware/__tests__/
212 pass, 0 fail, 559 expect() calls
Ran 212 tests across 12 files. [939ms]
```

All 212 tests pass. The 3 new F6 tests + 1 new F9 test all pass.

### Scoring

- Original base score (e07b442 re-review): 84/100
- F6 fix: +4 points → 88
- F9 fix: +4 points → 92
- **Final: 92/100** (meets ≥92 threshold)

### Recommendation

PR #41 is ready-for-review. Recommend `gh pr ready 41`.

Report by Nikaya 🔍