# Remaining P1 Fixes — Implementation Plan

> **Date:** 2026-05-18  
> **Author:** Hugrukal 📐 (System Architect)  
> **Repo:** `alygn/infrastructure`  
> **Scope:** 5 remaining P1 issues on Kill Switch system  
> **Status:** Planning — ready for Wobblus review

---

## Executive Summary

Five P1 security/reliability issues remain. All are server-side with one client-side
touchpoint (#20 sign-up form). No issues are blocked by external dependencies.
Three issues can run in parallel (#20, #21, #22). CI/CD (#23) and unit tests (#24)
form a natural sequential dependency chain.

**Total estimated effort:** 12–16 developer-hours across 2 agents in parallel.

---

## 1. Per-Issue Task Breakdown

---

### #20 [P1] Password Complexity Requirements

**Problem:** Better-Auth v2 accepts any password via `Bun.password.hash()`.
No minimum complexity enforced server-side or client-side.

**Current state:**
- `apps/server-kill-switch/src/lib/auth.ts:55-58` — password config:
  ```typescript
  password: {
    hash: (input: string) => Bun.password.hash(input),
    verify: ({ password, hash }) => Bun.password.verify(password, hash),
  },
  ```
- `apps/server-kill-switch/src/routes/auth.ts` — all `/v1/auth/*` requests
  are forwarded directly to `auth.handler()` in a catch-all. No pre-validation.
- `apps/web-regulator/components/sign-up-form.tsx` — only checks that
  `password === repeatPassword`. No complexity rules.

**Required password policy:** min 16 chars, uppercase, lowercase, number, special char.

**Target files (in execution order):**

| Step | File | Action | Est. LOC |
|------|------|--------|----------|
| 1 | `apps/server-kill-switch/src/utils/password-validation.ts` | **CREATE** — `validatePassword(password: string): { valid: boolean; errors: string[] }` with regex checks for all 5 rules | ~30 |
| 2 | `apps/server-kill-switch/src/routes/auth.ts` | **MODIFY** — intercept `POST /v1/auth/sign-up/email` before forwarding to Better-Auth. Parse JSON body, call `validatePassword()`, return 422 with detailed errors if invalid. Must read body, validate, then reconstruct Request with same body for forwarding. | ~35 |
| 3 | `apps/web-regulator/components/sign-up-form.tsx` | **MODIFY** — add `passwordErrors` state, real-time validation as user types, visual feedback (checklist of rules turning green as satisfied/red when violated), disable submit button until all rules pass | ~60 |
| 4 | `apps/server-kill-switch/src/utils/__tests__/password-validation.test.ts` | **CREATE** — unit tests (detailed in §5) | ~60 |

**Server-side implementation detail for step 2:**

The `handleAuthRoutes()` catch-all currently does:
```typescript
if (url.startsWith('/v1/auth/')) {
  const webRequest = nodeToWebRequest(req);
  const response = await auth.handler(webRequest);
  ...
}
```

We need to intercept sign-up POST **before** the catch-all. Add a new block:
```typescript
// Password complexity validation for sign-up
if (method === 'POST' && url === '/v1/auth/sign-up/email') {
  const body = await parseJsonBody(req); // reuse existing pattern from flags.ts
  const validation = validatePassword(body?.password || '');
  if (!validation.valid) {
    res.writeHead(422, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Password does not meet complexity requirements',
      errors: validation.errors,
    }));
    return true;
  }
  // Fall through to catch-all for actual Better-Auth processing
  // Use the already-read body in nodeToWebRequest
  req.body = JSON.stringify(body);
}
```

**Better-Auth v2 note:** Better-Auth v2 does not have a built-in password validation
hook. Pre-validation at the route handler level is the only reliable approach.
The password is still hashed by Bun.password (Argon2id) once it reaches Better-Auth.

**Agent assignment:** `be-coder` (server) + `fe-coder` (sign-up form)  
**Model:** `ollama/deepseek-v4-pro:cloud`  
**Thinking level:** `low` — straightforward validation logic  

---

### #21 [P1] Replace Tailscale IP with MagicDNS

**Problem:** Hardcoded Tailscale CGNAT IP `100.66.199.80` in `DEFAULT_ALLOWED_IPS`.
IP changes on Tailscale reconnects, breaking allowlist. Must resolve DNS at startup
and refresh periodically.

**Current state:**
- `apps/server-kill-switch/src/services/ip-allowlist.ts:8` — `DEFAULT_ALLOWED_IPS = ['100.66.199.80', '192.168.1.11', '127.0.0.1', '::1', '::ffff:127.0.0.1']`
- The `ALLOWED_IPS` array is derived from `parseEnvList()` at module load time.
  Once loaded, it never changes.
- No DNS resolution exists anywhere in this file.

**Goal:** Replace hardcoded IP with `andlersrv.tail62d797.ts.net` MagicDNS hostname.
Resolve DNS at startup, inject resolved IPs into allowlist, refresh every 5 minutes.

**Target files:**

| Step | File | Action | Est. LOC |
|------|------|--------|----------|
| 1 | `apps/server-kill-switch/src/services/ip-allowlist.ts` | **MODIFY** — Remove `100.66.199.80` from defaults. Add `TAILSCALE_MAGICDNS` constant. Add `startDnsRefresh()` function that calls `dns.resolve4()` at startup + `setInterval(5min)`. Add `getCurrentAllowedIps()` that returns merged list (static + resolved). Keep existing `isIpInCidr/isIpAllowed` functions unchanged — they just need to use the dynamic list. | ~50 |
| 2 | `apps/server-kill-switch/src/index.ts:33` | **MODIFY** — After Redis connection, call `startDnsRefresh()` from ip-allowlist module to initiate periodic DNS resolution. | ~3 |
| 3 | `apps/server-kill-switch/src/services/__tests__/ip-allowlist.test.ts` | **CREATE** — unit tests (detailed in §5) | ~80 |

**Implementation detail:**

```typescript
// In ip-allowlist.ts:
import { resolve4 } from 'node:dns/promises';

const TAILSCALE_MAGICDNS = 'andlersrv.tail62d797.ts.net';
const DNS_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let dnsResolvedIps: string[] = [];
let refreshTimer: ReturnType<typeof setInterval> | null = null;

export async function refreshTailscaleDns(): Promise<string[]> {
  try {
    const addresses = await resolve4(TAILSCALE_MAGICDNS);
    dnsResolvedIps = addresses;
    console.log(`[ip-allowlist] DNS resolved ${TAILSCALE_MAGICDNS} → [${addresses.join(', ')}]`);
    return addresses;
  } catch (err: any) {
    console.error(`[ip-allowlist] DNS resolution failed for ${TAILSCALE_MAGICDNS}: ${err.message}`);
    // Keep previous resolution; don't clear dnsResolvedIps on failure
    return dnsResolvedIps;
  }
}

export function startDnsRefresh(): void {
  refreshTailscaleDns(); // immediate first resolution
  refreshTimer = setInterval(refreshTailscaleDns, DNS_REFRESH_INTERVAL_MS);
}

export function stopDnsRefresh(): void {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

// Modify getEffectiveAllowedIps() or pass through isIpAllowed with the dynamic list
export function isIpAllowed(ip: string): boolean {
  const normalizedIp = ip.replace(/^::ffff:/, '');

  // Check static + DNS-resolved IPs
  const allIps = [...ALLOWED_IPS, ...dnsResolvedIps];
  if (allIps.includes(normalizedIp) || allIps.includes(ip)) return true;

  for (const cidr of CIDR_RANGES) {
    if (isIpInCidr(normalizedIp, cidr)) return true;
  }
  return false;
}
```

**Edge cases to handle:**
- DNS resolution fails at startup → log error, continue with empty resolved list (static IPs still work)
- DNS returns multiple A records → add all of them
- Periodic refresh fails → keep previous resolution, don't zero out
- `dns` module availability: Bun supports `node:dns/promises` natively

**Agent assignment:** `be-coder`  
**Model:** `ollama/deepseek-v4-pro:cloud`  
**Thinking level:** `low` — straightforward DNS + timer pattern  

---

### #22 [P1] Redis-Backed Rate Limiter

**Problem:** Rate limiter uses in-memory `Map` — state lost on server restart.
All rate limit counters reset to zero, enabling burst attacks after reboot.

**Current state:**
- `apps/server-kill-switch/src/middleware/rate-limit.ts` — exports
  `ReadRateLimiter`, `WriteRateLimiter` classes (both `Map<string, {count, windowStart}>` based),
  and `checkRateLimit(ip, method, url): { allowed, retryAfter? }` function.
- `apps/server-kill-switch/src/services/rate-limiter.ts` — LEGACY file with old single
  `RateLimiter` class (10/min). NOT used by index.ts anymore.
- `apps/server-kill-switch/src/middleware/auth-rate-limit.ts` — uses same Map pattern
  for auth rate limits (5 attempts/15min).
- `apps/server-kill-switch/src/index.ts:62-68` — calls `checkRateLimit(ip)` with
  default method+url params (no method/url passed!).

**Critical finding in index.ts:** The current call site is:
```typescript
const rate = checkRateLimit(ip); // ← missing method and url params!
```
This means `isReadRequest(undefined)` → `false`, so ALL requests are treated as write
requests (10/min). This is a latent bug. The `method` and `url` from the request must
be passed.

**Goal:** Replace Map storage with Redis Sorted Sets using `withClient()` from
`RedisPool`. Preserve the existing API signature: `checkRateLimit(ip, method, url)` →
`{ allowed, retryAfter? }`.

**Target files:**

| Step | File | Action | Est. LOC |
|------|------|--------|----------|
| 1 | `apps/server-kill-switch/src/middleware/rate-limit.ts` | **REWRITE** — Replace Map-based `ReadRateLimiter`/`WriteRateLimiter` classes with Redis sorted set implementation. Accept `RedisPool` via constructor. Use `withClient()` to access raw node-redis for `zAdd`, `zRemRangeByScore`, `zCard`, `expire`. Keep exported `checkRateLimit()` function with identical signature. Add `initRateLimiter(redis)` function for injection. | ~100 |
| 2 | `apps/server-kill-switch/src/types/redis-pool.ts` | **MODIFY** — Add `zAdd`, `zRemRangeByScore`, `zCard`, `expire` to `RedisPool` interface (or document that `withClient` gives raw redis access). Actually, `withClient` already gives raw redis client — no interface change needed. | ~0 |
| 3 | `apps/server-kill-switch/src/index.ts:29,62` | **MODIFY** — Call `initRateLimiter(redis)` after Redis connection. Fix the `checkRateLimit(ip)` call to pass `method` and `url` from the request. | ~5 |
| 4 | `apps/server-kill-switch/src/middleware/__tests__/rate-limit.test.ts` | **CREATE** — unit tests (detailed in §5) | ~100 |

**Redis sorted set implementation detail:**

```typescript
import type { RedisPool } from '../types/redis-pool';

let _redis: RedisPool | null = null;

export function initRateLimiter(redis: RedisPool): void {
  _redis = redis;
}

class RedisSlidingWindowRateLimiter {
  constructor(private windowMs: number, private maxRequests: number) {}

  async check(ip: string): Promise<boolean> {
    if (!_redis) {
      // Graceful degradation: fall back to allowing requests
      console.warn('[rate-limit] Redis not initialized, allowing request');
      return true;
    }

    const now = Date.now();
    const key = `ratelimit:${this.windowMs}:${ip}`;

    return _redis.withClient(async (client: any) => {
      const member = `${now}:${Math.random()}`;
      const cutoff = now - this.windowMs;

      // Pipeline for atomicity
      const pipeline = client.multi();
      pipeline.zAdd(key, { score: now, value: member });
      pipeline.zRemRangeByScore(key, 0, cutoff);
      pipeline.zCard(key);
      pipeline.expire(key, Math.ceil(this.windowMs / 1000) + 1);
      const results = await pipeline.exec();
      // results[2] is zCard result
      const count = results[2] as number;

      return count <= this.maxRequests;
    });
  }
}
```

**Bug fix note:** The `checkRateLimit()` function currently receives `method` and `url`
parameters, but `index.ts` calls it as `checkRateLimit(ip)` with default params.
This means every request uses `isReadRequest('GET')` → true, so ALL requests use
read limiter (60/min). This is a latent bug. The fix in step 3 must pass the actual
HTTP method and URL.

**Edge cases:**
- Redis unavailable → log warning, allow request (don't block on infrastructure failure)
- Redis reconnects → rate limiter recovers automatically via RedisPool connection management
- High concurrency → Redis sorted sets handle this naturally (atomic pipeline)

**Agent assignment:** `be-coder`  
**Model:** `ollama/deepseek-v4-pro:cloud`  
**Thinking level:** `high` — Redis pipeline coordination, edge cases, graceful degradation  

---

### #23 [P1] GitHub Actions CI/CD Pipeline

**Problem:** Zero CI/CD. No automated quality gates, tests, linting, or build verification.

**Current state:**
- `.github/workflows/` — directory doesn't exist, no `ci.yml`
- `.husky/` — may not exist; `prepare` script has `husky prepare` but needs verification
- `apps/server-kill-switch/package.json` — has `type-check`, `lint`, `dev`, `start`, `build` scripts
- `apps/web-regulator/package.json` — has `dev`, `build`, `lint` scripts. NO `type-check` or `test` scripts
- `apps/server-slashing-engine/package.json` — separate app, has its own scripts
- `apps/server-telemetry-handler/package.json` — separate app
- Root `package.json` — has `lint`, `test`, `build` scripts using `bun --filter '*'`
- `docs/SECURITY-REMEDIATION-PLAN.md` — **DOES NOT EXIST**

**Goal:** CI pipeline with 5 stages: tsc check, Biome lint, tests, build, pre-commit hooks.

**Target files:**

| Step | File | Action | Est. LOC |
|------|------|--------|----------|
| 1 | `.github/workflows/ci.yml` | **CREATE** — CI workflow definition | ~80 |
| 2 | `apps/web-regulator/package.json` | **MODIFY** — add `"type-check": "tsc --noEmit"` and `"test": "echo 'No tests yet'"` scripts | ~3 |
| 3 | Root `package.json` | **MODIFY** — add `"type-check": "bun --filter '*' type-check"` script | ~1 |
| 4 | `.husky/pre-commit` | **CREATE** — pre-commit hook: `bun run type-check && bun run lint` | ~5 |

**CI workflow structure:**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }
      - run: bun install
      - run: bun run type-check

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }
      - run: bun install
      - run: bun run lint

  test:
    needs: [type-check]
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: [6379:6379]
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }
      - run: bun install
      - run: bun run test
        env:
          REDIS_URL: redis://localhost:6379

  build:
    needs: [type-check, lint]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
        with: { bun-version: latest }
      - run: bun install
      - run: bun run build
```

**CI will run tests as empty until #24 is completed** — the workflow
is designed to be future-proof. The `test` script in each app that lacks
tests currently returns exit code 0 (or we add `"test": "echo 'no tests'"`).

**Agent assignment:** `devops`  
**Model:** `ollama/deepseek-v4-pro:cloud`  
**Thinking level:** `low` — YAML config, straightforward  

---

### #24 [P1] Unit Tests — 0% → 80% coverage

**Problem:** Zero unit tests in `apps/server-kill-switch/`. Existing tests are in
other apps (`telemetry-handler`, `tests/` at root for integration).

**Coverage targets (80% across 6 modules):**

| # | Module | File | Priority | Complexity |
|---|--------|------|----------|------------|
| 1 | StateMachine | `services/kill-switch.ts` | HIGH | High — needs Redis mock |
| 2 | secureCompare | `utils/secure-compare.ts` | HIGH | Low — pure functions |
| 3 | RateLimiter | `middleware/rate-limit.ts` | HIGH | Medium — needs Redis mock |
| 4 | IP Allowlist | `services/ip-allowlist.ts` | MEDIUM | Low — pure functions |
| 5 | Flag CRUD | `routes/flags.ts` | MEDIUM | Medium — needs DB mock |
| 6 | Settings | `routes/settings.ts` | MEDIUM | Medium — needs DB mock |

**Test framework:** Bun's built-in test runner (`bun test`).
**Mocking:** Use `bun:test` mock functions (`mock.module`, `mock`, `spyOn`).

**All test files to create:**

| Test file | Scenarios | Est. LOC |
|-----------|-----------|----------|
| `apps/server-kill-switch/src/services/__tests__/kill-switch.test.ts` | 15 scenarios | ~200 |
| `apps/server-kill-switch/src/utils/__tests__/secure-compare.test.ts` | 8 scenarios | ~60 |
| `apps/server-kill-switch/src/middleware/__tests__/rate-limit.test.ts` | 10 scenarios | ~150 |
| `apps/server-kill-switch/src/services/__tests__/ip-allowlist.test.ts` | 10 scenarios | ~100 |
| `apps/server-kill-switch/src/routes/__tests__/flags.test.ts` | 12 scenarios | ~180 |
| `apps/server-kill-switch/src/routes/__tests__/settings.test.ts` | 12 scenarios | ~160 |
| **TOTAL** | **67 scenarios** | **~850** |

---

## 2. Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                        DEPENDENCY MAP                           │
│                                                                 │
│  #20 (Password)  ─── no blockers ───►                          │
│  #21 (Tailscale)  ─── no blockers ───►   All independent       │
│  #22 (Redis RL)   ─── no blockers ───►   at implementation     │
│  #23 (CI/CD)      ─── no blockers ───►   level                 │
│                                                                 │
│  #24 (Tests) ───── depends on: ────┐                          │
│    • kill-switch.test.ts           │ no deps (pure mock)       │
│    • secure-compare.test.ts        │ no deps (pure function)   │
│    • rate-limit.test.ts            │ ⚠️ WAIT for #22 final API │
│    • ip-allowlist.test.ts          │ ⚠️ WAIT for #21 final API │
│    • flags.test.ts                 │ no deps (DB mock)         │
│    • settings.test.ts              │ no deps (DB mock)         │
│                                                                 │
│  #23 (CI test step) ─ depends on ─► #24 completion             │
│                                                                 │
│  KEY: ───► = blocks    ⚠️ = soft-block (must see final API)   │
└─────────────────────────────────────────────────────────────────┘
```

**Hard blocking relationships:**
- None — all #20–#23 are independent of each other
- #24 rate-limit tests need #22's final API (but not the Redis implementation)
- #24 ip-allowlist tests need #21's final `isIpAllowed` signature
- #23 CI test step is more meaningful AFTER #24 is done (but CI file itself doesn't need tests)

**Soft blocking:**
- #24 rate-limit tests should be written AFTER #22 is implemented to verify the real API
- #24 ip-allowlist tests should be written AFTER #21 to capture the DNS-resolved IP behavior
- #20 password-validation tests can be written immediately (new file, no deps)

---

## 3. Execution Order

### Phase 1 — Parallel (2 agents, ~4–6 hours)

```
Agent A (be-coder):                  Agent B (be-coder + devops):
├── #20 Password complexity          ├── #21 Tailscale DNS
│   ├── utils/password-validation.ts │   └── services/ip-allowlist.ts
│   └── routes/auth.ts intercept     │
├── #22 Redis rate limiter           ├── #23 CI/CD + Husky
│   ├── middleware/rate-limit.ts      │   ├── .github/workflows/ci.yml
│   └── index.ts integration         │   ├── root package.json scripts
└── Fix: checkRateLimit(ip) bug      │   └── .husky/pre-commit
    (missing method/url in index.ts)  │
```

### Phase 2 — Sequential (Agent A, ~4–6 hours)

```
#24 Unit Tests (ordered by dependency):
├── 1. utils/__tests__/secure-compare.test.ts        (no deps, pure function)
├── 2. services/__tests__/ip-allowlist.test.ts        (after #21 done)
├── 3. middleware/__tests__/rate-limit.test.ts         (after #22 done)
├── 4. services/__tests__/kill-switch.test.ts          (needs Redis mock, most complex)
├── 5. routes/__tests__/flags.test.ts                  (needs DB mock)
└── 6. routes/__tests__/settings.test.ts               (needs DB mock)
```

### Phase 3 — Integration (Agent B, ~1 hour)

```
├── Client-side password validation
│   └── apps/web-regulator/components/sign-up-form.tsx
├── CI verification
│   └── Push → GitHub Actions run → all green
└── Coverage report
    └── Verify ≥80% on target modules
```

### Phase 4 — Sign-off

```
├── All 5 GH issues closed
├── CI passing on main branch
├── Coverage report attached to #24
└── Wobblus review → merge to main
```

---

## 4. Agent Assignments & Model Recommendations

| Issue | Agent | Model | Thinking | Rationale |
|-------|-------|-------|----------|-----------|
| #20 (Password) | `be-coder` + `fe-coder` | `ollama/deepseek-v4-pro:cloud` | `low` | Simple validation + React form update. No complex logic. |
| #21 (Tailscale) | `be-coder` | `ollama/deepseek-v4-pro:cloud` | `low` | DNS resolution + setInterval. Standard Node.js pattern. |
| #22 (Redis RL) | `be-coder` | `ollama/deepseek-v4-pro:cloud` | `high` | Redis sorted set pipeline + atomicity + graceful degradation. Requires careful error handling. |
| #23 (CI/CD) | `devops` | `ollama/deepseek-v4-pro:cloud` | `low` | YAML configuration, well-documented GitHub Actions patterns. |
| #24 (Tests) | `be-coder` × 2 (parallel sub-agents) | `ollama/deepseek-v4-pro:cloud` | `low` | Test writing is voluminous but mechanical. Split 6 test files across 2 agents: agent-1 (kill-switch, flags, settings = ~540 LOC) and agent-2 (secure-compare, rate-limit, ip-allowlist = ~310 LOC). |

**Sub-agent spawn recommendation for #24:**
```bash
# Agent 1: Complex tests (StateMachine, Flag CRUD, Settings)
sessions_spawn agentId=be-coder task="Write unit tests for kill-switch.test.ts,
flags.test.ts, settings.test.ts per plan at docs/plans/REMAINING-P1-FIXES-PLAN.md §5"

# Agent 2: Simple tests (secureCompare, rate-limit, ip-allowlist)
sessions_spawn agentId=be-coder task="Write unit tests for secure-compare.test.ts,
rate-limit.test.ts, ip-allowlist.test.ts per plan at docs/plans/REMAINING-P1-FIXES-PLAN.md §5"
```

---

## 5. Test Strategy — Detailed Coverage Spec

### 5.1 `services/__tests__/kill-switch.test.ts`

**Mock required:** RedisPool (all methods), crypto.randomUUID

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `ARM → RUNNING` via transitionTo | `AuditEntry` returned, `newState = 'RUNNING'` |
| 2 | `RUNNING → STOPPING` via transitionTo | `AuditEntry` returned, `newState = 'STOPPING'` |
| 3 | `STOPPING → STOPPED` via transitionTo | `AuditEntry` returned, `newState = 'STOPPED'` |
| 4 | `STOPPED → ARMED` via transitionTo | `AuditEntry` returned, `newState = 'ARMED'` |
| 5 | Any state → `LOCKED` via transitionTo | Valid for all states |
| 6 | `LOCKED → STOPPED` via transitionTo | Valid (only exit from LOCKED) |
| 7 | `ARM → STOPPING` invalid transition | Throws Error with statusCode=409 |
| 8 | `RUNNING → STOPPED` skipping STOPPING | Throws Error with allowed states list |
| 9 | Same state → same state | Throws Error (not in VALID_TRANSITIONS) |
| 10 | `getCurrentState()` when Redis empty | Returns `'ARMED'` (default) |
| 11 | `getCurrentState()` when Redis has state | Returns stored state |
| 12 | `authenticate()` with valid Bearer token | Returns `true` |
| 13 | `authenticate()` with invalid Bearer token | Returns `false` |
| 14 | `authenticate()` with valid X-API-Key | Returns `true` |
| 15 | `healthCheck()` returns full status | `{ status, killSwitchState, redis, auditLogSize, timestamp }` |

### 5.2 `utils/__tests__/secure-compare.test.ts`

**No mocks needed — pure function tests.**

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Identical strings: `"abc123"` | `true` |
| 2 | Different strings: `"abc123"` vs `"def456"` | `false` |
| 3 | Different lengths: `"short"` vs `"longer"` | `false` (returns false at length check) |
| 4 | First arg `undefined` | `false` |
| 5 | Second arg `undefined` | `false` |
| 6 | Both args `undefined` | `false` |
| 7 | Empty string `""` with any other | `false` (fails `!a \|\| !b`) |
| 8 | Long identical strings (1KB) | `true` (timing-attack resistant) |

### 5.3 `middleware/__tests__/rate-limit.test.ts`

**Mock required:** RedisPool with `withClient()` returning mock redis client

| # | Scenario | Expected |
|---|----------|----------|
| 1 | First request from IP | `{ allowed: true }` |
| 2 | 60th GET request within window | `{ allowed: true }` |
| 3 | 61st GET request within window | `{ allowed: false, retryAfter: 60 }` |
| 4 | GET after window expires | `{ allowed: true }` (new window) |
| 5 | 10th POST request within window | `{ allowed: true }` |
| 6 | 11th POST request within window | `{ allowed: false, retryAfter: 60 }` |
| 7 | Heartbeat URL always allowed | `{ allowed: true }` regardless of count |
| 8 | Two IPs tracked independently | IP-A at limit doesn't block IP-B |
| 9 | `isReadRequest('GET')` returns true | `true` |
| 10 | `isReadRequest('POST')` returns false | `false` |

### 5.4 `services/__tests__/ip-allowlist.test.ts`

**Mock required:** `dns.resolve4` for DNS tests, override ALLOWED_IPS/CIDR_RANGES

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Exact IP match: `'127.0.0.1'` | `true` |
| 2 | IPv6 loopback: `'::1'` | `true` |
| 3 | IPv4-mapped IPv6: `'::ffff:127.0.0.1'` | `true` (normalized then matched) |
| 4 | CIDR /24 match: `'192.168.1.5'` in `'192.168.1.0/24'` | `true` |
| 5 | CIDR /24 miss: `'192.168.2.5'` not in `'192.168.1.0/24'` | `false` |
| 6 | Docker bridge: `'172.17.5.10'` in `'172.17.0.0/16'` | `true` |
| 7 | Network address: `'172.16.0.0'` in `'172.16.0.0/12'` | `true` |
| 8 | Broadcast: `'172.31.255.255'` in `'172.16.0.0/12'` | `true` |
| 9 | Unknown IP not in any range | `false` |
| 10 | DNS-resolved IP added dynamically | `true` for resolved IP |

### 5.5 `routes/__tests__/flags.test.ts`

**Mock required:** `db` module (Drizzle), `crypto.randomUUID`

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `GET /v1/flags` empty DB | Returns `{ flags: [] }` |
| 2 | `GET /v1/flags/:id` existing flag | Returns `{ flag: {...} }` |
| 3 | `GET /v1/flags/:id` missing | Returns 404 |
| 4 | `POST /v1/flags` with admin | Creates flag, returns 201 with `{ flag: {...} }` |
| 5 | `POST /v1/flags` with non-admin | Returns 403 |
| 6 | `POST /v1/flags` missing key/value | Returns 400 |
| 7 | `PUT /v1/flags/:id` update value | Returns 200 with updated flag |
| 8 | `PUT /v1/flags/:id` on missing flag | Returns 404 |
| 9 | `DELETE /v1/flags/:id` | Returns `{ success: true, deleted: id }` |
| 10 | `DELETE /v1/flags/:id` non-admin | Returns 403 |
| 11 | `GET /v1/flags/:id/audit` after mutations | Returns audit log entries |
| 12 | Audit entry has correct fields | `{ id, flagId, action, oldValue, newValue, userId, timestamp }` |

### 5.6 `routes/__tests__/settings.test.ts`

**Mock required:** `db` module (Drizzle)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `GET /v1/settings` empty DB | Returns `{ settings: {}, updatedAt: null }` |
| 2 | `GET /v1/settings/:key` existing | Returns `{ key, value, updatedAt }` |
| 3 | `GET /v1/settings/:key` missing | Returns 404 |
| 4 | `POST /v1/settings` with admin | Updates settings, returns `{ updated: [...], timestamp }` |
| 5 | `POST /v1/settings` with non-admin | Returns 403 |
| 6 | `PUT /v1/settings/:key` with admin | Updates single setting |
| 7 | `PUT /v1/settings/:key` non-admin | Returns 403 |
| 8 | Validation: `auto_poll_interval=500` (too low) | Returns 400 |
| 9 | Validation: `auto_poll_interval=70000` (too high) | Returns 400 |
| 10 | Validation: `auto_poll_interval=5000` (valid) | Updated successfully |
| 11 | Validation: `enable_notifications="maybe"` | Returns 400 |
| 12 | Unknown setting key | Returns 404 or `Unknown setting` error |

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| #22 Redis sorted set implementation breaks existing rate limit behavior | Medium | High | Keep backward-compatible API. Add graceful degradation fallback to allow requests if Redis unavailable. Test heavily in #24. |
| #21 DNS resolution fails at startup | Medium | Low | Static IPs still work as fallback. Log error, continue. |
| #20 Password validation rejects existing admin seed | Low | Medium | Admin seed uses KILL_SWITCH_AUTH_TOKEN which is env-controlled. Ensure admin password meets complexity or seed before validation is added. |
| #23 Bun setup action version changes | Low | Low | Pin `oven-sh/setup-bun@v1` with `bun-version: latest`. |
| #24 Test volume stalls implementation | Medium | Medium | Split across 2 parallel sub-agents. Prioritize high-impact tests (StateMachine, RateLimiter). |
| `checkRateLimit(ip)` called without method/url in index.ts | Confirmed | High | Must fix together with #22. Currently every request uses read limiter (60/min) instead of split read/write. |

---

## 7. Definition of Done

Each issue is complete when:

| # | DoD Criteria |
|---|-------------|
| #20 | `validatePassword()` rejects weak passwords on server (422 + error list). Sign-up form shows real-time password strength feedback. Tests pass with ≥90% coverage of validation function. |
| #21 | `isIpAllowed()` uses DNS-resolved Tailscale IPs. DNS refreshed every 5 minutes. DNS failure doesn't break allowlist. Tests pass for CIDR + DNS scenarios. |
| #22 | Rate limiter persists state across restarts (Redis). `checkRateLimit(ip, method, url)` preserves same return type. Graceful degradation when Redis unavailable. `index.ts` passes method+url params. Tests pass for window boundaries and concurrent IPs. |
| #23 | CI runs on push/PR to main. All stages (type-check → lint → test → build) pass. Husky pre-commit runs `type-check && lint`. |
| #24 | ≥80% line coverage on 6 target modules. All test files exist and pass. CI test stage runs tests and reports results. |

---

*End of plan. Ready for Wobblus review and agent dispatch.*
