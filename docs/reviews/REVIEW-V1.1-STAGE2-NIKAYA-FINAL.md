# Stage 2 Review (Nikaya) — Kill Switch v1.1 — FINAL

> **Reviewer:** Nikaya 🔍
> **Date:** 2026-06-04 18:35 CST (start) → 19:05 CST (end) — 30 min budget
> **Scope:** v1.1 § 8.1 + § 8.2a–d on the LIVE stack
> **Previous:** Stage 1 PASS (Wobblus, 2026-06-03); Stage 2 PARTIAL (Nikaya, 2026-06-03,
> 3 env blockers, all now resolved)
> **Contract:** `docs/api-contracts/per-machine-flags-v1.md` (LOCKED, Chanshuk 2026-06-02)
> **Verdict:** **FAIL** — 2 P0 (critical) bugs in the running backend must be fixed before
> the 3 new per-machine endpoints are shippable. Stage 1's "code-complete, spec-compliant"
> verdict is correct in isolation, but live-stack + edge-case code review caught issues
> that the staged contract review missed.

---

## 1. Preflight (all PASS, 3 previous blockers resolved)

| Check | Result | Notes |
|---|---|---|
| Container `alygn-kill-switch` health | ✅ PASS | "Up 10 minutes (healthy)" |
| `GET /health` | ✅ PASS | `{"status":"alive","timestamp":"2026-06-05T00:34:56.270Z"}` |
| `flag_audit_log.machine_id` column | ✅ PASS | Schema shows `, machine_id TEXT` + `flag_audit_machine_id_idx` |
| 5 predefined flags seeded | ✅ PASS | `alert_on_critical_score, auto_stop_threshold, damage_logging_level, llm_interception_enabled, request_sampling_rate` (plus 2 pre-existing test flags: `flag_test_1`, `sampling_rate`) |
| `GET /v1/machines/machine-andlersrv-001/flags` | ✅ PASS | 200 OK with merged view, all 4 visible flags (request_sampling_rate hidden by global default; sampling_rate is an older duplicate) |

> **⚠️ Preflight gotcha noted:** The `KILL_SWITCH_AUTH_TOKEN` in `.env` (64-char hash)
> does NOT match the one actually loaded in the running container
> (`andlersrv-auth-token-2026`, 25 chars). The env file is stale. Stage 2 uses the
> **container's env value** (the live source of truth). This is a pre-existing
> ops/secret-rotation issue, not a v1.1 bug, but worth flagging to ops.

> **🚨 Preflight gotcha #2 (out-of-scope but blocking E2E):** The web app's auth-client
> is hardcoded to `https://andlersrv.tail62d797.ts.net:8443/api/auth` (Tailscale),
> but the local dev server is at `http://127.0.0.1:3001`. The CSP allows
> `connect-src 'self' ws://localhost:3000 wss://andlersrv.tail62d797.ts.net:8443` —
> `wss://` is for WebSockets, not fetch, so the auth-client's `getSession` fetch to
> HTTPS is **CSP-blocked**. This is a **pre-existing dev environment config bug**
> that prevents the E2E flow from running (see § 5). Not v1.1's fault but blocks
> Stage 2's E2E verification.

---

## 2. Code Review — `apps/server-kill-switch/src/routes/flags.ts` (575 lines)

### 2.1 Spec compliance

| Contract clause | Implementation | Status |
|---|---|---|
| § 1 — 3 new endpoints (GET/PUT/DELETE) | All present, regex `^\/v1\/machines\/([^/]+)\/flags(\/[^/]+)?$` | ✅ |
| § 2 — admin role check on all 3 new endpoints | `if (userRole !== 'admin')` before each handler | ✅ |
| § 3.1 — GET response shape `{machineId, flags[], overrides[]}` | Lines ~375-415, matches contract shape | ✅ |
| § 3.1 — `overridden: !!ov` | Line ~409 | ✅ |
| § 3.1 — Type coercion rule | `coerceFlagValue()` helper (line ~99), `coerceFlagValue` correctly handles `null`/`"true"`/`"1"` for booleans | ✅ |
| § 3.1 — Order: machine > global > default | Line ~387 (`if (ov) rawResolved = ov.value; else if (global)…`) | ✅ |
| § 3.2 — PUT validation (type, range, enum) | `coerceIncomingValue` + per-flag range/enum checks | ✅ |
| § 3.2 — 400 on missing `value` | "Missing required field: value" | ✅ (tested) |
| § 3.2 — 400 on out-of-range for `auto_stop_threshold` / `request_sampling_rate` | Lines ~412-416 (tested: 1.5 → 400) | ✅ |
| § 3.2 — 400 on bad enum for `damage_logging_level` | Lines ~417-422 (tested: "ultra" → 400) | ✅ |
| § 3.2 — 404 on missing machine | Lines ~339-345 | ✅ (tested) |
| § 3.2 — 404 on missing flag | Lines ~351-354 | ✅ code path, **but BUG** — see § 3.1 below |
| § 3.2 — 200 success shape `{flagKey, value, updatedAt, overridden}` | Lines ~458-464 | ✅ (except value type — see § 3.3) |
| § 3.3 — DELETE 204 idempotent | `if (prior) delete else still log` | ✅ (tested: 204 + audit row written) |
| § 4 — Error shape `{error: "..."}` | All error paths use this | ✅ |
| § 4 — **MUST NOT leak `err.message` in 500 body** | **❌ VIOLATED** — see § 3.1 P0 bug |
| § 5 — No `next.config.ts` change | Verified unchanged | ✅ |
| § 6 — `logMachineFlagAction` helper with `machineId` | Lines ~60-75 | ✅ |
| § 6.1 — DB column `machine_id` populated | Verified in live DB schema | ✅ |
| § 6.2 — `override-set` / `override-cleared` / `override-rejected` actions | All 3 used | ✅ |
| § 6.3 — Cascade-delete `machine_flag` on `DELETE /v1/flags/:id` | Lines ~309-310 | ✅ (tested live) |
| § 7 — WebSocket publish to `bcp:flags:updates` | Lines ~467-473, ~487-493 | ✅ |

### 2.2 — Spec gaps / minor findings

- **P2 (Medium):** `feature_flag` table does NOT have a `type` column. The BE coder
  hardcoded the 5 KNOWN types in `KNOWN_FLAG_TYPES` (line 90-96). Any new flag
  created via `POST /v1/flags` will have unknown type → 500 in some paths (see
  § 3.3). This is a known limitation since the table is legacy, but the contract
  doesn't explicitly call it out. Document or accept.

- **P3 (Low):** Contract § 3.1 says "Unparseable → omit the entry from `flags`
  and log a warning." Implementation does this (lines ~395-398), but the warning
  is `console.warn` only — no metric/audit trail. For a security-sensitive system
  this should land in `flag_audit_log` with action `value-parse-failed` so ops
  can detect corrupted overrides.

- **P3 (Low):** `parseJsonBody` (line 32) does not enforce a max body size.
  A malicious client could send a 10GB JSON and OOM the server. Trivial fix:
  cap at e.g. 64KB.

### 2.3 — Code quality

- ✅ All 3 new endpoints reuse the existing `parseJsonBody` and `json` helpers
- ✅ DB queries use the imported `eq` and `and` from drizzle-orm
- ✅ Upsert pattern (read prior → update or insert) is correct
- ✅ Drizzle types are respected (no `any` in business logic except `req: any` which is forced by the Bun.serve shape)
- ⚠️ The function is now 575 lines; consider splitting into `flags.ts` (global) + `machine-flags.ts` (per-machine). Future maintenance burden.

---

## 3. Critical Bugs (live-stack testing surfaced)

### 3.1 P0 — 500 response leaks `err.message` as `detail` field (contract § 4 violation)

**Location:** `apps/server-kill-switch/src/routes/flags.ts:572` (catch block at the bottom of `handleFlagsRoutes`)

```ts
} catch (err: any) {
  console.error('[flags] Error:', err.message);
  json(res, 500, { error: 'Internal server error', detail: err.message });
  return true;
}
```

**Contract violation:** `docs/api-contracts/per-machine-flags-v1.md` § 4 explicitly
states:

> "The BE coder MUST NOT leak `err.message` in the 500 body (use the existing
> 500 handler at the bottom of `routes/flags.ts`)."

**Live evidence:**
```
PUT /v1/flags/some-id with body "garbage"
→ HTTP 500
→ {"error":"Internal server error","detail":"Invalid JSON body"}

PUT /v1/machines/machine-andlersrv-001/flags/nonexistent_flag
→ HTTP 500 (should be 404)
→ {"error":"Internal server error","detail":"FOREIGN KEY constraint failed"}
```

**Impact:**
1. **Information disclosure** — `err.message` reveals internals (DB errors, file paths, library names). For a kill-switch system that's prime target for adversarial probing.
2. **Error response shape non-conformant** — frontend `ApiError` may not handle the unexpected `detail` field, leading to confusing UX.

**Fix:** Remove `detail: err.message` from the 500 response. Just return `{error: "Internal server error"}` and log the full error to console (already done).

**Severity:** P0 — contract violation + security risk on a kill-switch system.

### 3.2 P0 — Unknown flag key causes 500 with FK constraint error (should be 404)

**Location:** `apps/server-kill-switch/src/routes/flags.ts:446` (rejection path for unknown flag key in `PUT /v1/machines/:id/flags/:key`)

```ts
if (!flag) {
  await logMachineFlagAction('unknown', machineId, 'override-rejected', userId, null, null);
  json(res, 404, { error: `Flag not found: ${flagKey}` });
  return true;
}
```

**The bug:** `logMachineFlagAction('unknown', ...)` inserts into `flag_audit_log`
with `flag_id = 'unknown'`. But `flag_audit_log.flag_id` has `NOT NULL REFERENCES
feature_flag(id) ON DELETE CASCADE`. The string `'unknown'` is not a valid
`feature_flag.id`, so the insert **fails with FK constraint error**, the outer
`catch` block runs, and the user gets a **500** instead of the intended 404.

**Live evidence:**
```
PUT /v1/machines/machine-andlersrv-001/flags/nonexistent_flag
   with body {"value": true}
→ Expected: 404 {"error":"Flag not found: nonexistent_flag"}
→ Got:      500 {"error":"Internal server error","detail":"FOREIGN KEY constraint failed"}
```

(Note: the unknown-MACHINE rejection path works correctly, because the flag IS
looked up first and the real flag.id is used. The bug is only on the unknown-FLAG
path.)

**Impact:** Every "bad flag key" 404 request returns 500. Logically a 404
should be returned, but instead the system crashes and (per § 3.1) leaks
internal error detail. Two P0s in one.

**Fix:** Either:
- (a) Skip the audit insert when `flag` is null (simplest):
  ```ts
  if (!flag) {
    json(res, 404, { error: `Flag not found: ${flagKey}` });
    return true;
  }
  ```
- (b) Make `flag_id` nullable in `flag_audit_log` and use NULL when unknown.
  This is a schema change and risks losing audit lineage.

Option (a) is the right call. The contract § 6.2 says "audit logs are
tamper-evident" but also says the audit on rejection is "informational" — losing
the 1 unknown-flag audit row per request is acceptable vs. crashing the request.

**Severity:** P0 — contract violation + always-500 on a normal user error path.

### 3.3 P2 — Unknown flag type returns STRING value in PUT response (contract § 3.2 violation)

**Location:** `apps/server-kill-switch/src/routes/flags.ts:457-464` (PUT success path)

```ts
const type = getFlagType(flagKey);
const coerced = coerceIncomingValue(body.value, type);
...
const resolved = coerceFlagValue(stored, type);  // ← type may be null!
json(res, 200, {
  flagKey,
  value: resolved,  // ← returns the raw string when type is null
  ...
});
```

**The bug:** `getFlagType(flagKey)` returns `null` for any flag not in the
hardcoded `KNOWN_FLAG_TYPES` map. Then `coerceFlagValue(stored, null)` returns
the raw string (line 99-103, the `return raw` fallthrough). So a PUT to a
custom flag with `value: false` returns `"value": "false"` (string) instead
of `false` (boolean).

**Live evidence:**
```
POST /v1/flags with key="cascade2" value=true
PUT  /v1/machines/machine-andlersrv-001/flags/cascade2 with {"value": false}
→ Expected: 200 {"flagKey":"cascade2","value":false, ...}
→ Got:      200 {"flagKey":"cascade2","value":"false", ...}  ← string
```

**Contract violation:** § 3.2 explicitly says "value in the response is the
**resolved effective value** (always coerced back to the right JS type)".

**Impact:** Only affects custom (non-5-predefined) flags. The 5 predefined
flags coerce correctly. Custom flags are rarely created (legacy schema doesn't
support new flag types cleanly), so the user-facing impact is small. But it's
a contract violation that the spec's binding clause "always" leaves no wiggle
room on.

**Fix:** Either:
- (a) Infer the type from the stored value: if `"true"`/`"false"`/`"1"`/`"0"` → boolean, else if numeric → number, else string
- (b) Add a `type` column to `feature_flag` table (Drizzle migration)
- (c) Document that custom flags return their raw string in the response

**Severity:** P2 — spec violation on a rarely-used code path. Not user-blocking
for the 5 predefined flags.

### 3.4 P3 — `parseJsonBody` has no size limit (DoS risk)

**Location:** `apps/server-kill-switch/src/routes/flags.ts:32`

Trivial to exploit. A POST with a 1GB body will buffer the entire body before
attempting JSON parse. **Fix:** Add a `Content-Length` check or stream-with-limit
in `parseJsonBody`.

---

## 4. Cascade-Delete Verification

### 4.1 DELETE global flag → machine_flag cascade

**Test setup:**
```
1. POST /v1/flags {key:"cascade_test_flag", value:true, description:"..."}
2. PUT  /v1/machines/machine-andlersrv-001/flags/cascade_test_flag {value:false}
3. DELETE /v1/flags/<flagId>
```

**Result:**
- Step 1: 201 Created with flag id `8445e171-…`
- Step 2: 200 OK with `{flagKey:"cascade_test_flag", value:"false", overridden:true}`
- Step 3: 200 OK with `{success:true, deleted:"8445e171-…"}`
- Post-step-3 DB query: `SELECT * FROM machine_flag WHERE flag_key='cascade_test_flag'` → **0 rows** ✅

**Verdict:** Cascade-delete works as specified in contract § 6.3.

### 4.2 DELETE machine → machine_flag cascade

`machine_flag.machine_id` has `ON DELETE CASCADE` to `machine.id` (verified in
live schema). So a machine delete would cascade. **Not directly tested in this
session** — there's no `DELETE /v1/machines/:id` endpoint, only the `/flags` sub-resource.
The FK constraint guarantees correctness; a code-path test isn't required.

### 4.3 DELETE global flag → flag_audit_log cascade

The FK on `flag_audit_log.flag_id` is `ON DELETE CASCADE`. So when a global
flag is deleted, **all its audit log rows are also deleted**. This means the
contract's "audit log is tamper-evident" intent (per § 6.2) is partially
undermined — deleting a global flag erases its history.

**Note:** This is a **schema design choice**, not a v1.1 bug. The Drizzle
schema explicitly says `ON DELETE CASCADE` (verified in `schema.ts` line 153).
A future patch could change to `ON DELETE SET NULL` to preserve history. Out
of v1.1 scope, but flag for the schema owner to consider.

---

## 5. E2E Verification

### 5.1 What was attempted

Per the task spec, the E2E should be: login → /machines → open Flag Editor →
change flag → save → verify persists across reload.

I tried 5 different Playwright approaches:
1. Direct browser nav to /auth/login with creds — **CSP blocked the auth-client's `getSession` call to Tailscale**
2. With cookie set + route intercept — **same CSP block**
3. With cookie + `page.route` to Tailscale → localhost — **same CSP block**
4. With cookie + `page.route` returning fake session JSON — **server-side middleware (Supabase) redirected to /login**
5. With `--disable-web-security` + cookie + route intercept — **same Supabase redirect**

### 5.2 What works

✅ **API-level end-to-end is verified.** I exercised the full flow via curl:

```
# Happy path
GET    /v1/machines/<id>/flags                  → 200, merged view
PUT    /v1/machines/<id>/flags/<key>            → 200, override stored
GET    /v1/machines/<id>/flags                  → 200, "overriding global" appears
DELETE /v1/machines/<id>/flags/<key>            → 204, override cleared
GET    /v1/machines/<id>/flags                  → 200, override gone, global returned

# Edge cases
PUT  /v1/machines/<id>/flags/<key>  with value 1.5  → 400 "auto_stop_threshold must be in [0.0, 1.0]"
PUT  /v1/machines/<id>/flags/<key>  with "ultra"   → 400 "Invalid value for damage_logging_level"
PUT  /v1/machines/<id>/flags/<key>  with {}        → 400 "Missing required field: value"
PUT  /v1/machines/<id>/flags/<key>  unknown machine → 404
PUT  /v1/machines/<id>/flags/<key>  unknown flag   → 500 ❌ (BUG § 3.2)
PUT  /v1/flags/<id>                  garbage JSON  → 500 with detail leak ❌ (BUG § 3.1)

# Auth
PUT  ...  no auth header             → 401 "Authentication required" ✅

# Cascade
DELETE /v1/flags/<flag-id>            → 200, machine_flag rows for that key also deleted ✅
```

All API-level contracts verified except the 2 P0 bugs.

### 5.3 Why browser E2E didn't run

The web app at `http://127.0.0.1:3001` has TWO independent auth-related config
issues that prevent browser-driven E2E:

1. **`auth-client` hardcoded to Tailscale URL.** `apps/web-regulator/lib/auth-client.ts`
   line 14 uses `process.env.NEXT_PUBLIC_BETTER_AUTH_URL` which is set to
   `https://andlersrv.tail62d797.ts.net:8443/api/auth` in `.env.local`. The
   build is baked, so changing env at runtime doesn't help. The auth-client's
   `getSession` fetch is CSP-blocked (CSP allows `wss://…` not `https://…`).

2. **Supabase proxy in dashboard layout.** `(dashboard)/layout.tsx` has an
   `AuthGuard` that uses `useAuth()` from `auth-context.tsx`. If `isAuthenticated`
   is false, it redirects to `/login`. The `useAuth` hook uses the broken
   auth-client, so `isAuthenticated` is always false in local dev.

**This is a pre-existing dev-environment config issue, not a v1.1 bug.** v1.1
adds per-machine flag endpoints, which the backend serves correctly (verified
above). The Flag Editor component code is on disk and well-implemented (see § 6
for a11y review). The only thing that doesn't work is **browsing to it from
local dev** because the dev environment's auth wiring is broken.

**Recommendation to Wobblus:** Either (a) accept API-level E2E proof for this
release, OR (b) open a separate ticket to fix the dev env auth config (set
`NEXT_PUBLIC_BETTER_AUTH_URL=http://127.0.0.1:3001/api/auth` in `.env.local` and
rebuild the web app), then re-run browser E2E.

---

## 6. A11y Quick Check — `apps/web-regulator/components/machines/machine-flag-editor.tsx` (506 lines)

### 6.1 What's done well ✅

- **Dialog** uses Radix `Dialog` with `DialogTitle` + `DialogDescription` — proper labelling
- **Input labels** — each input has `<label htmlFor={`flag-${flag.key}`}>` correctly associated
- **Switch** (radix) has built-in `role="switch"` and `aria-checked`
- **Select** (radix) has proper roles
- **Save/Revert buttons** have `title` attributes explaining state
- **Button text** always includes visible label (not icon-only) — "Save" and "Revert" spans are present
- **Per-row "Manage flags" button** in `machines/page.tsx` has `aria-label={`Manage flags for ${machine.name}`}` ✅
- **Error region** uses `text-destructive` (good color) + icon
- **Loading state** has skeleton + "Verifying session…" text in layout (good)
- **Live region** — `machines/page.tsx` line 805-806 has `role="alert" aria-live="assertive"` for connection errors ✅
- **Live region (polite)** — line 793-794 has `role="status" aria-live="polite"` for "Live — WebSocket connected" ✅

### 6.2 Findings

- **P2 (Medium):** The Flag Editor's error region (line ~261 in component) uses
  `text-destructive` but no `role="alert"` or `aria-live="assertive"`. Screen
  reader users won't be notified when the initial fetch fails. **Fix:** add
  `role="alert"` to the error div.

- **P2 (Medium):** "Overriding global" badge is visual-only. Sighted users see
  the amber border + text, but screen reader users only hear the flag key +
  type. **Fix:** add `aria-label="Local override active, differs from global"`
  to the badge, or wrap in `role="status"`.

- **P3 (Low):** The boolean Switch in `FlagValueInput` (line ~423) has no `aria-label`. For
  screen readers it announces "switch" with no context about which flag.
  **Fix:** add `aria-label={flag.key}` or wrap in labelled region.

- **P3 (Low):** All 5 input labels say "Current value" — non-distinguishable
  when navigating. **Fix:** use `aria-label="Value for ${flag.key}"` on each
  input or label.

- **P3 (Low):** The `parseFromInput` error toast uses `toast.error` (sonner)
  which is announced by screen readers via its own `role="status"`. ✅ (OK as-is)

### 6.3 What I did NOT verify (out of scope of 5-min a11y check)

- `prefers-reduced-motion` — I didn't grep for it. Should be in next-stage work.
- Color contrast — assuming Tailwind defaults are WCAG AA compliant.
- Focus management during Save/Revert — Radix Dialog handles initial focus; the Save button is disabled when not dirty, so keyboard users have visual feedback.
- Mobile 375px dialog rendering — not tested.

---

## 7. Performance

- **GET endpoint** — 8–12ms p99 for 10 sequential calls (curl-measured). Excellent.
- **No N+1 queries** — the GET handler does 3 queries (machine, globals, overrides), no per-flag query. Good.
- **PUT/DELETE** — single update/delete statement. Good.
- **Nit (P3):** The 3 queries in GET could be combined into 1 LEFT JOIN, but the
  current shape is clear and the perf is already well under any threshold.

---

## 8. Security

- ✅ **Auth on all 3 new endpoints** — admin role required
- ✅ **Auth on global flag endpoints** — unchanged
- ✅ **SQL injection-safe** — Drizzle ORM with parameterized queries
- ✅ **Rate limiting** — handled by middleware (index.ts line 67)
- ✅ **CORS** — properly configured
- ✅ **Audit log** — all mutations logged with `machine_id`
- ❌ **Information disclosure (P0)** — 500 responses leak `err.message` (see § 3.1)
- ⚠️ **No body size limit** (P3) — DoS risk (see § 3.4)
- ⚠️ **FK cascade on audit log** (informational) — `ON DELETE CASCADE` on
  `flag_audit_log.flag_id` means deleting a global flag erases its history.
  Trade-off vs. tamper-evidence. Out of v1.1 scope.

---

## 9. Spec Adherence (re-score)

The contract is mostly honored. The 2 P0 bugs are spec violations (§ 4 and
implicit § 6.2 — the rejection audit must not crash the response). The P2 bug
is also a § 3.2 violation. WebSocket publish, cascade-delete, admin role checks,
audit row shape, status codes — all correct.

---

## 10. Score Breakdown

| Category | Score | Notes |
|---|---|---|
| **Code correctness** | 22/40 | 2 P0 bugs (one is a 500 leak, one is FK crash on 404 path). 1 P2 bug. Happy paths all work. |
| **A11y** | 11/15 | Strong foundation (Radix, proper labels, live regions in layout). 2 P2 a11y issues in the Flag Editor. |
| **Performance** | 14/15 | 10ms p99 GET, no N+1. 1 nit (3 queries could be 1). |
| **Security** | 10/15 | Auth, RBAC, audit, CORS, rate limit all good. P0 info-leak via 500 detail field is a real issue. No body size cap. |
| **Spec adherence** | 10/15 | Most of the contract honored. 2 P0 violations (contract § 4, § 6.2). 1 P2 violation (§ 3.2). |
| **TOTAL** | **67/100** | Below 85 threshold → **FAIL** |

The P0 bugs are quick fixes (~5 min for the BE coder). Once they're in, the
score jumps to ~92/100.

---

## 11. Final Verdict

# 🔴 FAIL — 2 P0 bugs must be fixed before v1.1 ships

**One-line reasoning:** The contract said "MUST NOT leak err.message in 500" —
the implementation does, on multiple code paths; and the 404 path for unknown
flag keys returns 500 due to a stray audit insert that violates the FK constraint.

**Required fixes (P0, ~10 min total):**

1. **`flags.ts` line 572** — Remove `detail: err.message` from the 500 response.
   Keep the `console.error` for ops visibility. The contract is clear here.

2. **`flags.ts` line 446** — Wrap the `logMachineFlagAction('unknown', ...)` in
   `if (flag)` (and the machine-not-found path similarly), OR make the unknown
   case skip audit entirely. Currently the unknown-flag path crashes the 404.

**Recommended (P2, ~15 min):**

3. **`flags.ts` lines 456-464** — Infer the type from the stored value when
   `getFlagType` returns null. Or document that custom flags return raw strings.

**Recommended (P2, a11y, ~15 min):**

4. **machine-flag-editor.tsx:261** — Add `role="alert"` to the error region.
5. **machine-flag-editor.tsx:343** — Add `aria-label` to the "overriding global" badge.

**Out of scope (P3, future work):**

6. `parseJsonBody` size limit.
7. `flag_audit_log` FK ON DELETE CASCADE → SET NULL to preserve history.
8. Dev env auth config (`NEXT_PUBLIC_BETTER_AUTH_URL` set to localhost).

**Once P0s are fixed:** re-run the 5 smoke curls from § 5.2 to confirm all return
the expected status codes and bodies. A second Stage 2 review is not needed —
the fixes are surgical. E2E in the browser remains blocked by the pre-existing
dev env config bug; either accept API-level E2E proof or open a separate ticket.

---

## 12. Report Summary (for Wobblus)

🟢/🔴 KILL-SWITCH V1.1 STAGE 2 — **FAIL** — Score: **67/100**

### Preflight
- Container: ✅
- DB schema (machine_id column): ✅
- 5 flags seeded: ✅
- New endpoints: ✅ (200 OK on happy paths; **500 on 2 error paths — see findings**)

### Findings
- **[P0/Critical]** 500 response leaks `err.message` as `detail` — `apps/server-kill-switch/src/routes/flags.ts:572` — Remove the `detail: err.message` field; contract § 4 forbids it.
- **[P0/Critical]** Unknown flag key returns 500 instead of 404 — `apps/server-kill-switch/src/routes/flags.ts:446` — Skip the `logMachineFlagAction('unknown', ...)` when `flag` is null (or gate it in an `if (flag)`). The `'unknown'` literal violates the FK constraint on `flag_audit_log.flag_id`.
- **[P2/Medium]** Unknown flag type returns STRING value in PUT response — `apps/server-kill-switch/src/routes/flags.ts:458-513` — Infer type from stored value or document the limitation.
- **P2 (Medium — a11y)** Flag Editor error region has no `role="alert"` — `apps/web-regulator/components/machines/machine-flag-editor.tsx:261` — Add `role="alert"` so screen readers announce fetch errors.
- **P2 (Medium — a11y)** "Overriding global" badge is visual-only — `apps/web-regulator/components/machines/machine-flag-editor.tsx:343` — Add `aria-label="Local override active, differs from global"`.
- **[P3/Low]** `parseJsonBody` has no body size cap (DoS) — `apps/server-kill-switch/src/routes/flags.ts:32` — Add 64KB cap.
- **[P3/Low — a11y]** Switch has no `aria-label`; labels all say "Current value" — `apps/web-regulator/components/machines/machine-flag-editor.tsx:423` — Add `aria-label={flag.key}` to the Switch; make labels distinct.
- **[Informational]** `flag_audit_log.flag_id` has `ON DELETE CASCADE` — deleting a global flag erases its audit history. Consider `ON DELETE SET NULL` to preserve. Out of v1.1 scope.
- **[Pre-existing, blocking E2E]** Web app `auth-client` hardcoded to Tailscale URL; CSP blocks it in local dev. Not a v1.1 bug, but prevents browser-driven E2E. See § 5.3.

### Score breakdown
- Code correctness:  22/40
- A11y:              11/15
- Performance:       14/15
- Security:          10/15
- Spec adherence:    10/15
- **TOTAL:            67/100**

### E2E verification
- ✅ API-level E2E: all happy paths + validations + auth + cascade verified via curl (10+ requests)
- ❌ Browser E2E: blocked by pre-existing dev env config (auth-client Tailscale URL + Supabase middleware). Code is correct; environment is broken.
- ✅ Cascade-delete: live-verified, machine_flag rows cleared on global flag delete

### Verdict
**FAIL — fix 2 P0 bugs (≈10 min), then re-smoke. Score will jump to ~92/100. E2E remains blocked by pre-existing dev env config (separate ticket).**

Report by Nikaya 🔍
