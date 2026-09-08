# V5 — SQLite Persistence (WAL) + Drizzle

**Claim:** Whitepaper v1.5 §2.5 — SQLite persistence with WAL + Drizzle deployed.
**Status:** ✅ VERIFIED LIVE (persistence + WAL) — restart-survival test pending restart access
**Verifier:** Volthiz (QA) — 2026-09-08 12:55 CST

## Evidence

### 1. SQLite database live with WAL mode

```bash
$ docker exec alygn-kill-switch ls /app/data/
kill-switch.sqlite  kill-switch.sqlite-shm  kill-switch.sqlite-wal
```

- `-wal` + `-shm` files present → **WAL mode active**.
- Volume-mounted: `infrastructure_kill-switch-data:/app/data` → survives container rebuilds.

### 2. Data persisted across the 5-day uptime

DB copy inspected (`docker cp` → local sqlite3):

| Table | Rows | Notes |
|-------|------|-------|
| `kill_switch_audit_log` | 6 | entries from 2026-08-26 → 2026-09-08 (seed + 3 transitions + deny + approve) |
| `machine` | 1 | andlersrv-local tenant |
| `discovered_machine` | 13 | 1 ADMITTED, 1 DENIED, 11 NEW_MACHINE |
| `registration_request` | 2 | APPROVED + DENIED |
| `feature_flag` | 8 | seeded |
| `machine_flag` | 8 | seeded at admission |
| `verification_event` | 15 | inference verification records |
| `webauthn_credential` | 1 | admin credential registered |
| `user` / `account` | 1 / 1 | Better-Auth admin |

### 3. Append-only audit log enforced at DB level

```sql
CREATE TRIGGER kill_switch_audit_log_no_update BEFORE UPDATE ... RAISE(ABORT, 'append-only (ADR-140)');
CREATE TRIGGER kill_switch_audit_log_no_delete BEFORE DELETE ... RAISE(ABORT, 'append-only (ADR-140)');
```

- UPDATE/DELETE triggers present in schema → tamper-evidence at storage layer.

### 4. Drizzle schema (source)

`apps/server-kill-switch/src/db/schema.ts` — 20+ tables via `sqliteTable` with `integer('created_at', { mode: 'timestamp' })`; migrations in `drizzle/` (0000–0007).

## Blocked on

- **Restart-survival test** (restart process → state + audit intact) requires service restart access (sudo systemctl or deploy pipeline).

## Verdict

**V5: VERIFIED (WAL active, data persisted 5 days, append-only triggers live). Restart-survival evidence pending restart access.**
