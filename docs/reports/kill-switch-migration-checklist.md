# Kill Switch Migration Checklist — v1 to v2

**Target:** Deploy SQLite + Better-Auth architecture

---

## Phase 1: Create Database Layer

- [ ] Create `src/db/index.ts` (SQLite + Drizzle)
- [ ] Create `src/db/schema.ts` (user table with role, apiKeyHash)
- [ ] Test: `bun run src/db/index.ts` (should create `./data/db.sqlite`)

---

## Phase 2: Configure Better-Auth

- [ ] Create `src/lib/auth.ts` (drizzleAdapter, emailAndPassword)
- [ ] Update `src/index.ts` to import `auth` from `@/lib/auth`
- [ ] Remove old `src/auth/better-auth.ts` (memory adapter)
- [ ] Remove `seedAdminUser()` calls

---

## Phase 3: Create Seed Script

- [ ] Create `scripts/seed-admin.ts` (uses `auth.api.signUpEmail()`)
- [ ] Add env vars: `ADMIN_EMAIL`, `KILL_SWITCH_AUTH_TOKEN`
- [ ] Test: `bun run scripts/seed-admin.ts`
- [ ] Verify: User created in database

---

## Phase 4: Update Docker

- [ ] Update Dockerfile to build TypeScript (`bun run src/index.ts`)
- [ ] Add volume: `./data:/app/data` in docker-compose.yml
- [ ] Rebuild: `docker build -t kill-switch-api:v2 .`
- [ ] Test container: `docker-compose up kill-switch-api`

---

## Phase 5: Integration Test

- [ ] Start full stack: `docker-compose up -d`
- [ ] Visit: `https://andlersrv.tail62d797.ts.net:8443/login`
- [ ] Login: `admin@alygn.com` / `[env token]`
- [ ] Verify: Session persists, admin UI accessible

---

## Rollback Plan

If v2 fails:
1. Stop container: `docker-compose down kill-switch-api`
2. Restore old image: `docker tag kill-switch-api:v1 kill-switch-api:latest`
3. Restart: `docker-compose up -d kill-switch-api`

---

**Estimated time:** 45-60 minutes
**Risk:** Low (SQLite is production-proven, pattern copied from accounting-dashboard)
