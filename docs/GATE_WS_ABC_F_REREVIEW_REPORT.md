# GATE — WS-A / WS-B / WS-C / WS-F Re-Review Report

**Date:** 2026-09-09 03:45 CST
**Reviewer:** Nikaya (Stage 2)
**Repo:** `Intention-Alliance/alygn-core-infra` @ main `7988ff5f`
**Method:** 100% live evidence — probes :3000/:3001, private DB copy, fresh builds, fresh worktree. Zero hearsay. No child subagents.
**Board:** alygn-activation (cards below)

---

## 1. WS-A — Agent Plane (rework `4ec8cd7e`) — **88/100 FAIL**
**Card:** `1a883e6f-9db0-4674-be49-8238881a26f3`

### All 6 ciclo-2 findings FIXED + live-verified
| Finding (ciclo 2) | Evidence |
|---|---|
| `self.ollamaUrl` shadowing | ✅ `interceptor.ts` constructor uses `this.ollamaUrl`; `readonly ollamaUrl` field |
| MAC glob never expanded | ✅ `getMacs()` via `readdirSync('/sys/class/net')` + per-iface address read — **14 MACs live** (state DB fingerprint) |
| 15 tests / 5 files | ✅ `bun test`: **15 pass / 0 fail / 5 files** (e2e ran against real mother, 13.61ms, not skipped) |
| Dockerfile + install.sh + systemd | ✅ Fresh `docker build` succeeded (bun 1.2.23-alpine); install.sh renders unit with env; unit file present |
| enforcement.ts | ✅ Fail-closed until first poll; live log: `Kill-switch state changed: unknown → RUNNING` |
| puerto :11435→:11434 | ✅ Smoke instance (:19997) forwards `/api/version` → real Ollama `{"version":"0.33.1"}` |

### Live probes
- Mother :3000 alive (401 unauthed; authed kill-switch status → `state:RUNNING`)
- Heartbeat vs real mother: agent.log shows continuous `Heartbeat acknowledged: state=OK drift=none`; state DB `last_heartbeat.acknowledged=true`, `kill_switch_state=RUNNING`
- Interceptor forwards to Ollama 0.33.1; enforcement poll running (1s interval in smoke)
- `tsc --noEmit` clean

### NEW findings (not in the 6)
1. **[MEDIUM] `getCpuModel()`/`getMemoryMb()` broken on procfs — `Bun.file().exists()` then `.text()` returns EMPTY.** Reproduced 3×: `exists()→text()` on `/proc/cpuinfo` = 0 bytes; `text()` alone = 6244 bytes. Live fingerprint: `cpuModel:"unknown"`, `memoryMb:0` on a real i5-7500T/16GB host. Also reproduced inside the built Docker image (bun 1.2.23). CPU/memory drift axes are silently dead. Fix: drop the `exists()` check (or use `readFileSync`).
2. **[MEDIUM] `getDiskGb()` parses the `df` header.** `df --output=size --total -B1G /` first line is `1G-blocks`; `parseInt("1G-blocks")` = 1 (not NaN). Live: diskGb=1, real disk=237GB. Fix: skip the header line.
3. **[LOW] Test gap:** `integrity.test.ts` asserts only MAC format — never cpu/mem/disk values, so both bugs pass the suite. The commit's "VERIFIED LIVE" claim is overstated (fingerprint was half-broken at verification time).

**Required fixes (to reach 92+):**
1. [MEDIUM] Fix procfs reads in `getCpuModel`/`getMemoryMb` (remove `exists()` gate) — `apps/agent-plane/src/integrity.ts`
2. [MEDIUM] Fix `getDiskGb` header parsing (skip non-numeric header line)
3. [LOW] Add value assertions to `integrity.test.ts` (cpuModel ≠ 'unknown', memoryMb > 0, diskGb > 1 on Linux)

---

## 2. WS-B — Ollama Provider (rework `ee32d40a`) — **95/100 PASS**
**Card:** `2ccda34e-b53b-4b9a-b9a8-54f1264cde10`

### All 4 ciclo-2 findings FIXED + live-verified
| Finding (ciclo 2) | Evidence |
|---|---|
| Doc WS-B inexistente | ✅ `docs/verification/WS-B-ollama-provider.md` (241 lines: probe/report evidence, 26-model inventory, verifier scoring, ADR-143 flow, repro) |
| Provider anclado a IP efímera | ✅ Live report: `machineId: machine-andlersrv`, `providerId: ollama`, `baseUrl: http://localhost:11434`, `status: healthy` — no `discovered-172-17-0-4` anywhere |
| Probe 404 en máquina inexistente | ✅ Live: `POST /v1/discovery/machine-does-not-exist/probe` → **HTTP 404** `{"error":"Machine not found in discovery registry"}` (was FK 500) |
| Flujo ADR-143 documentado | ✅ §5: verifier → verification_event → Scoring Engine → dashboard; ADR-143 correctly identified as WebAuthn credential storage |

### Additional verification
- 26 Ollama models live (report lists 26 ollama + 2 HF, matching doc)
- New test passes: `POST /v1/discovery/:id/probe returns 404 for unknown machine (WS-B)`
- Full suite: **640 pass / 37 fail** — matches commit claim; all 37 failures in pre-existing files (proxy-invariants, kill-switch-proxy-integration, webhook-auth, fingerprint-pause-escalation, verification-service, kill-switch-auth, kill-switch, traffic-pause, webauthn). Discovery tests: 6 pass / 0 fail. No failures in touched files.

**Approved for merge.**

---

## 3. WS-C — Wizard TUI (PR #83, head `b14e0de7`) — **74/100 FAIL**
**Card:** `9ee52ced-8848-478f-9a96-aa6bdd615b89` (nuevo, nunca revisado)

### Verified good
- PR: 16 commits, MERGEABLE, checks green (type-check/lint/test/build SUCCESS)
- Fresh worktree (`/tmp/ws-c-review` @ b14e0de7): **35/35 tests pass** (6 files), `tsc --noEmit` clean, biome clean
- Preflight (`system.ts`): OS/kernel/systemd/bun/redis/git/ports 3000+3001/hardware + remediation hints — solid
- Guided config (`configure.ts`): clack prompts, masked password, validation
- Secrets: `writeEnvFile` writes mode 0600 (test asserts 0600 even on pre-existing looser file); `generateSecrets` idempotent, returns key names only
- systemd units rendered + installed to `/etc/systemd/system`; uninstaller with `--purge` (scoped to install dir)
- Verifier: API liveness, redis, machines, audit log, **live heartbeat probe** (`POST /v1/discovery/heartbeat`, same payload as agent-plane)
- `install.sh`: self-checksum + tarball checksum, fails closed

### Findings
1. **[HIGH] systemd units never load the install `.env` → installed system cannot boot.** Units set `WorkingDirectory=apps/server-kill-switch` (server) / `apps/agent-plane` (agent) with only 1–2 `Environment=` lines. Bun loads `.env` **from the CWD only** — proven with clean env: `.env` at install root is NOT loaded when cwd=`apps/server-kill-switch`; `.env` in script dir is NOT loaded when cwd=root. The wizard writes `.env` to installDir root. Consequence: server starts → `validate-env.ts` fails fast (missing BETTER_AUTH_SECRET/KILL_SWITCH_API_KEY/AUDIT_HMAC_KEY…); agent starts → `index.ts` exits(1) "ALYGN_AGENT_API_KEY is required". The repo's own `start-kill-switch-host.sh` works only because it `source .env` from repo root. **Fix:** add `EnvironmentFile=<installDir>/.env` to both rendered units (or source env in ExecStart wrapper).
2. **[MEDIUM] `bun run wizard` does not exist.** `package.json` has `bin: {wizard}` but **no `wizard` script**; `install.sh` ends with `exec bun run wizard "$@"` → verified live: `error: Script not found "wizard"`. README documents `bun run wizard`. **Fix:** add `"wizard": "bun run src/index.ts"` to scripts (or change install.sh to `bun run src/index.ts`).
3. **[MEDIUM] `adminPassword` is collected but never used.** `configure.ts` prompts (min 16 chars), but the server seeds the admin from `KILL_SWITCH_AUTH_TOKEN` (`seedAdminUser`), which `generate-secrets.sh` generates randomly. The wizard's env block never writes the chosen password. Admin cannot log in with the password they set. **Fix:** write `KILL_SWITCH_AUTH_TOKEN=<adminPassword>` when provided (or drop the prompt).
4. **[MEDIUM] Agent env block sets `OLLAMA_INTERCEPT_PORT=11434`** — collides with the real Ollama port (agent-plane's own `.env.example` contract: intercept :11435 → forward :11434). Interceptor will fail to bind or hijack Ollama. **Fix:** `OLLAMA_INTERCEPT_PORT=11435`.
5. **[MEDIUM] `install.sh` references release artifacts that don't exist.** No release workflow, no tarball/`install.sh.sha256` publisher anywhere in the branch. The curl|sh bootstrap (Epic 1.5) cannot work until a release pipeline exists. Checksum logic itself is sound.
6. **[LOW] PR body claims `@align/shared-types` reuse** — zero imports found in wizard-tui. Doc inaccuracy only.

**Required fixes (to reach 92+):**
1. [HIGH] `EnvironmentFile=` in both systemd units (or env sourcing) — installed system must boot
2. [MEDIUM] Add `wizard` script to package.json
3. [MEDIUM] Wire `adminPassword` → `KILL_SWITCH_AUTH_TOKEN` or remove the prompt
4. [MEDIUM] `OLLAMA_INTERCEPT_PORT=11435`
5. [MEDIUM] Release pipeline for install.sh artifacts (or mark Epic 1.5 explicitly pending)

---

## 4. WS-F — Git Security (commit `7988ff5f`) — **96/100 PASS**
**Card:** `6228faf5-acff-4a16-95d2-c0a01da000ab` (nuevo, nunca revisado)

### All claims verified live
| Claim | Evidence |
|---|---|
| 3 ramas huérfanas borradas | ✅ `git ls-remote origin` — zero matches for `linkedin-fallback`/`image-router-build`; ref count 61 (was 64) |
| Doc WS-F-git-security.md | ✅ 101 lines: orphan-ref analysis, deletion evidence, gitleaks scan, mitigation |
| main limpio de `sb_secret_FJpLu` | ✅ `git log origin/main -S` → only the WS-F doc commit itself; `git grep origin/main` → only the doc file; no `tmp/update-bounce.js`, no personal files in main tree |
| `refs/pull/49/head` inerte documentado | ✅ Still present (`2570a9f0`), doc explains hidden-ref non-deletability + rotation mitigation; backup refs `refs/backup/wsf/*` (4) present locally |
| Doc no filtra el secret completo | ✅ Only truncated prefix `sb_secret_FJpLu…` (5 mentions), never the full value |

**Note:** the doc's blocking recommendation (rotate the Supabase service key) stands — a published secret can't be un-published. That's an Andler action, not a code fix.

**Approved for merge.**

---

## Summary

| Card | Score | Status |
|---|---|---|
| WS-A `1a883e6f` | 88/100 | **FAIL** — 3 fixes (integrity collection) |
| WS-B `2ccda34e` | 95/100 | **PASS** |
| WS-C `9ee52ced` | 74/100 | **FAIL** — 5 fixes (1 HIGH: units don't load .env) |
| WS-F `6228faf5` | 96/100 | **PASS** |

**Workboard:** no workboard tools available in this session — Wobblus must move the cards (WS-A/WS-C → back to coder; WS-B/WS-F → merge/QA).

---

# Ciclo 4 — Re-review final (2026-09-09 04:33 CST)

**Method:** 100% live evidence. Probes :3000/:11434/:11435, private DB copy (`/tmp/ws-review-db-copy.sqlite`), live `collectFingerprint()` run, fresh worktree `/tmp/ws-c-fresh`, install.sh generation simulation. Zero hearsay, zero child subagents.

## WS-A — Agent Plane (rework 9e2e4b3c + ac49c5b8, local main f43c4fe7) — **96/100 PASS**

| Finding ciclo 3 | Verdict | Evidence (live) |
|---|---|---|
| 1. procfs vacío (`exists()+text()`) → readFileSync | ✅ FIXED | `integrity.ts` usa `readFileSync` para cpu/mem/os (8 refs). `collectFingerprint()` en vivo: `cpuModel="Intel(R) Core(TM) i5-7500T CPU @ 2.70GHz"`, `memoryMb=15865`, `diskGb=237`, `osRelease="Arch Linux"`, 14 MACs — coincide exacto con lo esperado |
| 2. df header parseado como tamaño | ✅ FIXED | `getDiskGb()` toma la última línea puramente numérica (fila `--total`); live `diskGb=237` (no 1) |
| 3. integrity.test.ts sin assertions de VALORES | ✅ FIXED | `cpuModel not.toBe('unknown')`, `memoryMb > 0`, `diskGb > 10` — las regresiones de /proc y df ahora fallan la suite |
| 4. Secrets en `Environment=` (644) | ✅ FIXED | install.sh escribe `/etc/alygn-agent-plane.env` (umask 077, chmod 600, root); unit usa `EnvironmentFile=`; simulación: mode `600`, 0 secretos inline en el unit, EnvironmentFile presente |

**Tests:** `bun test` → **17 pass / 0 fail** (5 files; 17 = 16 del claim + el test nuevo de df de ac49c5b8). E2e vs madre real corrió (no skip): `(pass) HeartbeatClient e2e (real mother) > POST /v1/discovery/heartbeat is acknowledged with state OK [13.24ms]`; DB copy: fila `andlersrv | NEW_MACHINE | heartbeat | 2026-09-09 10:22:14`. `tsc --noEmit` limpio. Biome: solo diagnostics pre-existentes en archivos NO tocados por el rework (enforcement.test.ts, heartbeat.test.ts); ninguno nuevo en integrity.ts/integrity.test.ts.

**⚠️ Blocker de coordinación (no es defecto de código):** `origin/main` fue force-pusheado a `39f72ec4` y **NO contiene** los fixes de WS-A (0 `readFileSync` / 0 `EnvironmentFile` / 0 `toBeGreaterThan` en el árbol remoto; `9e2e4b3c`/`ac49c5b8` NO son ancestros de origin/main). Los fixes existen en `main` local (f43c4fe7) y el sistema vivo corre el código corregido, pero un clone fresco de GitHub obtiene el código sin fix. Wobblus debe confirmar la intención del rewrite y asegurar que los fixes aterricen en origin/main antes del merge.

**Approved for merge (una vez restaurado en origin/main).**

## WS-C — Wizard TUI (PR #83) — **FAIL (estado actual del PR)**

### Rework ciclo 3 verificado en `e55c7c95` — los 7 findings FIXED

| Finding ciclo 3 | Verdict | Evidence (live) |
|---|---|---|
| 1. `EnvironmentFile=<installDir>/.env` en AMBOS units | ✅ | `services.ts`: server unit línea 70 `EnvironmentFile=${installDir}/.env`; agent unit línea 93 idem |
| 2. Script `wizard` en package.json | ✅ | `apps/wizard-tui/package.json`: `"wizard": "bun run src/index.ts"`; root: `"wizard": "bun --filter @alygn/wizard-tui wizard"`; `bun run wizard` ejecuta el CLI (error legible con `--config` inexistente) |
| 3. adminPassword → KILL_SWITCH_AUTH_TOKEN | ✅ | `env.ts` escribe `KILL_SWITCH_AUTH_TOKEN=${config.adminPassword}`; live `writeEnvFile` → `KILL_SWITCH_AUTH_TOKEN=sup3r-secret-pw-123456`, mode `600`; server `auth.ts:120` lee `process.env.KILL_SWITCH_AUTH_TOKEN` (contrato cerrado) |
| 4. OLLAMA_BASE_URL default 11435 | ✅ | `config.ts`: `ollamaBaseUrl default('http://localhost:11435')`; live env: `OLLAMA_BASE_URL=http://localhost:11435`; interceptor agent-plane escucha :11435 → forward :11434 (sin colisión con Ollama real) |
| 5. Release workflow (tarball + checksums) | ✅ | `.github/workflows/release.yml` (59 líneas): tarball + `alygn-wizard-tui.tar.gz.sha256` + `install.sh.sha256`, trigger tag `v*` |
| 6. PR body sin claims falsos | ✅ | Body: "shape de `@align/shared-types` (SecurityThresholds, **sin dependencia directa**)"; spec línea 14 idem; 0 imports de @align/shared-types en wizard-tui |
| 7. 37/37 tests, tsc, biome | ✅ | Fresh worktree @ e55c7c95: **37 pass / 0 fail** (6 files); `tsc --noEmit` exit 0; biome 19 files, 0 issues |

### PERO — el head actual del PR NO contiene el trabajo

El branch fue force-pusheado: GitHub head = **`4a745949`** (updatedAt 2026-09-09T09:55:28Z), no `da469000` ni `e55c7c95`. En `4a745949`:

- `apps/wizard-tui` **no existe** en el árbol (`git ls-tree 4a745949 apps/` — ausente)
- `.github/workflows/` solo tiene `ci.yml` (sin release.yml)
- `package.json` root sin script `wizard`
- `gh pr diff 83 --name-only` → **solo `bun.lock`** (el commit 4a745949 "scaffold" tocó únicamente bun.lock)
- `e55c7c95` NO es ancestro de `4a745949` — los 22 commits del wizard quedaron huérfanos del branch (recuperables: `git cat-file -t e55c7c95` → commit; reflog `origin/feat/wizard-tui@{1}` = e55c7c95)

**Veredicto:** el rework ciclo 3 fue correcto y verificado en `e55c7c95` (95/100), pero el entregable actual del PR #83 está vacío → **FAIL**. Fix requerido: restaurar el branch a `e55c7c95` (o re-aplicar los commits del wizard) y force-pushear de vuelta. Los commits están intactos en el object store.

## Summary ciclo 4

| Card | Score | Status |
|---|---|---|
| WS-A `1a883e6f` | 96/100 | **PASS** — restaurar fixes en origin/main antes de merge (blocker de coordinación) |
| WS-C `9ee52ced` | 95/100 @ e55c7c95 / **FAIL @ head actual 4a745949** | **FAIL** — restaurar e55c7c95 en el PR #83 |

**Workboard:** cards NO movidas (sin tools de workboard en esta sesión) — Wobblus las mueve.
