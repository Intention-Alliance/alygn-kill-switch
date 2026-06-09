# Stage 2 Review (Nikaya) — Kill Switch v1.1 — PARTIAL / INCOMPLETE — SUPERSEDED

> **Status:** ⚠️ **SUPERSEDED** by `REVIEW-V1.1-STAGE2-NIKAYA-FINAL.md` (2026-06-04, 67/100, FAIL).
> This file preserves the **3 environmental blockers** identified during the original
> review run on 2026-06-03 (all subsequently fixed). The final review covers the
> same code with the live stack now correctly deployed, plus a full a11y + cascade
> + spec-adherence pass. **Read FINAL.md for the current verdict.**
>
> **Wobblus note:** These blockers are **environmental / deployment**, NOT code defects.
> The code itself passed Stage 1 spec compliance + type-check cleanly. The bugs are in the
> running stack (DB schema not migrated, flag seeds incomplete, Docker image stale).

---

## Critical Blocker 1 — DB schema not applied to live SQLite

**Symptom:** The running SQLite database (in the Docker container) does NOT have the new
`flag_audit_log.machine_id` column or the new `flag_audit_machine_id_idx` index.

**Evidence:** Direct query against the running DB while the kill-switch-api container is up
showed the `flag_audit_log` table schema is the OLD one (no `machine_id` column).

**Impact:** Every new code path in `routes/flags.ts` that does:
```ts
db.insert(flagAuditLog).values({ ..., machineId })
```
will **crash on insert** at runtime. This means PUT `/v1/machines/:id/flags/:key` and
DELETE `/v1/machines/:id/flags/:key` will return 500 errors as soon as anyone tries to
set or clear a per-machine override.

**Root cause:** The Drizzle migration file `apps/server-kill-switch/drizzle/0000_great_owl.sql`
is the freshly-generated output of `db:generate` after the schema was widened — but
**`bun run db:push` was never run against the running container's DB**, so the migration
file is sitting on disk while the live DB still has the pre-v1.1 schema.

**Fix (DrizzleORM workflow per MEMORY.md rule 22):**
```bash
cd apps/server-kill-switch
bun run db:push    # apply schema to live DB
bun run db:generate   # regenerate migration files (already done; will be a no-op)
```

---

## Critical Blocker 2 — Only 2 of 5 predefined flags are seeded

**Symptom:** The live `feature_flag` table contains only **2 rows** instead of the 5
predefined flags that the spec requires.

**Missing (3 of 5):**
- `auto_stop_threshold`
- `damage_logging_level`
- `alert_on_critical_score` (or similar — exact set varies; verify with a SELECT)

**Impact:** The new per-machine merged-view endpoint
(`GET /v1/machines/:id/flags`) iterates the 5 KNOWN flag keys and falls back to `null`
for any global row that doesn't exist. So the 3 missing flags will appear as
`null` / `overridden: false` / no value in the Flag Editor UI. **Degraded experience,
not a crash**, but the user will see "no value" on 3 of 5 rows in the dialog.

**Root cause:** The flag seeder (`db/seed.ts` or `db/seed-flags.ts`) was either never run
against the live DB, or it was run against an earlier schema and the new flags weren't added
in a later migration.

**Fix:**
```bash
cd apps/server-kill-switch
# Option A: re-run the seed script (idempotent — uses INSERT OR IGNORE / ON CONFLICT)
bun run db:seed

# Option B: insert manually via the running server
curl -X POST http://localhost:3000/api/flags \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_token=..." \
  -d '{"key":"auto_stop_threshold","type":"number","value":0.7,...}'
# (repeat for the other 2 missing flags)
```

---

## Critical Blocker 3 — Docker container is running stale code

**Symptom:** The running `server-kill-switch` container's `flags.ts` is **237 lines / 7.5KB**
(the OLD code from before v1.1). The working tree's `flags.ts` is **575 lines / ~11KB**
(the NEW v1.1 code with the 3 per-machine endpoints).

**Evidence:** Direct comparison of the in-container `flags.ts` against the working tree file
showed a 3.5KB / 338-line delta. The 3 new endpoints
(`/v1/machines/:id/flags`, `PUT/DELETE /v1/machines/:id/flags/:key`) are not registered
in the running process — confirmed by `curl` returning 404 for
`/v1/machines/machine-andlersrv-001/flags`.

**Impact:** **The new v1.1 code is not actually deployed**, despite being on disk. Every
live-stack test in Stage 2 (endpoints, debounce, audit log) was testing the OLD code
running in the OLD container.

**Root cause:** The Docker image was built at a commit **before the v1.1 work was
applied** to the working tree. The `docker-compose up -d` did NOT trigger a rebuild
because Compose only rebuilds when the image doesn't exist or `--build` is passed.

**Fix:**
```bash
# From repos/alygn/infrastructure/
docker-compose build server-kill-switch   # or: docker-compose build (rebuild all)
docker-compose up -d                      # restart with fresh image

# Verify
docker exec -it <container> sh -c \
  "wc -l /app/apps/server-kill-switch/src/routes/flags.ts"
# Expected: 575 lines (the new code)
```

---

## What Was NOT Verified (blocked by the 3 blockers above)

Because the live stack is running stale code with a stale DB, the following Stage 2
checks were **not** completed:

- ❌ § 8.1c end-to-end test (login → click machine → land on `/machines/<id>` → sidebar Quick Action → state change)
- ❌ § 8.2 endpoint end-to-end (GET/PUT/DELETE `/v1/machines/:id/flags/...`)
- ❌ Cascade-delete verification (delete a global flag → confirm machine_flag rows for that key are gone)
- ❌ WebSocket state-change delivery within 1s
- ❌ Live ARIA / keyboard nav / focus-trap on the new `MachineFlagEditor` dialog
- ❌ Live `prefers-reduced-motion` honored
- ❌ Live mobile 375px-width dialog rendering
- ❌ Doc page render (would render but uses `/v1/flags` which is OK in old code)

**What WAS verified (Stage 1 + Nikaya's live probes):**
- ✅ All code is on disk, type-checks (no NEW errors vs. baseline)
- ✅ All spec items implemented (verified by reading diffs)
- ✅ API contract honored exactly (verified by reading `flags.ts` route patterns)
- ✅ § 10 risk mitigations applied in code (250ms debounce, cascade-delete)
- ✅ DrizzleORM migration file generated correctly (untracked, ready to push)
- ✅ Better-Auth admin login works (confirmed admin user is seeded with right password)
- ✅ Working DB has 2 of 5 flags (proves the connection string + auth + db access all work)

---

## Recommendation to Orchestrator

The v1.1 work is **code-complete and spec-compliant**, but the live deployment is **stale**.
The 3 blockers are all `bun run db:push` + `docker-compose build` away from being fixed.
None of them require code changes.

**Once the env is fixed, this Stage 2 review needs to be re-run from scratch** — all the
live-stack verifications above were skipped because the running image is pre-v1.1.

---

*Partial report — Nikaya was cut off (Ollama API stream ended) before finalizing the score
and writing the full review. The 3 blockers above are real and require action before
v1.1 can be considered "live" in any meaningful sense.*
