# Wizard TUI — Shared Interface Spec (WS-C)

**Status:** Active — contract between be-coder (lib) and fe-coder (steps/UI).
**Date:** 2026-09-09
**Owner:** Chanshuk (dev-lead)

---

## 1. Stack decision (dev-lead)

**Bun + @clack/prompts.** Rationale:

- Same toolchain as the monorepo (bun workspaces, TS strict) — no second toolchain.
- Reuses `apps/agent-plane` heartbeat client contract and the shape of `@align/shared-types` (SecurityThresholds — no direct dependency; the wizard mirrors the interface with local defaults).
- `generate-secrets.sh` is bash — invoked from Bun, output merged into `.env`.
- Non-interactive `--config` replay is a first-class clack pattern.
- Team is TS-native; Rust+ratatui rejected (new toolchain, no code reuse, slower iteration).

## 2. App layout

```
apps/wizard-tui/
  package.json          # name: @alygn/wizard-tui, type: module, bin: wizard
  tsconfig.json
  src/
    index.ts            # CLI entry: arg parse, mode dispatch (be-coder owns skeleton, fe-coder owns prompt flows)
    lib/                # be-coder — pure logic, NO clack imports
      system.ts         # system detection + preflight report
      config.ts         # zod schema + load/merge (file + env + defaults)
      env.ts            # .env writer (0600), merge with generate-secrets.sh output
      services.ts       # systemd unit templates + install/uninstall
      installer.ts      # orchestration: env → secrets → units → migrate → start
      verifier.ts       # health checks + heartbeat probe
      uninstaller.ts    # rollback
    steps/              # fe-coder — clack UI layer, imports lib only
      preflight.ts
      configure.ts
      install.ts
      verify.ts
      handoff.ts
  scripts/install.sh    # curl|sh bootstrap + checksum (be-coder)
  test/                 # bun test (be-coder: lib tests; fe-coder: flow tests)
  README.md
```

## 3. Config schema (zod) — `WizardConfig`

```ts
{
  orgName: string            // white-label org (default "ALYGN")
  adminEmail: string         // default admin@<org>.com
  adminPassword?: string     // KILL_SWITCH_AUTH_TOKEN (min 16) — generated if absent
  motherUrl: string          // ALYGN_MOTHER_URL (default http://localhost:3000)
  machineId: string          // ALYGN_MACHINE_ID (default machine-<hostname>)
  machineName: string        // ALYGN_MACHINE_NAME (default hostname)
  machineHostname: string    // ALYGN_MACHINE_HOSTNAME (default os.hostname())
  redisUrl: string           // REDIS_URL (default redis://localhost:6379)
  webauthnRpId: string       // WEBAUTHN_RP_ID (default hostname)
  webauthnOrigin: string     // WEBAUTHN_ORIGIN (default http://localhost:3001)
  ollamaBaseUrl: string      // OLLAMA_BASE_URL (default http://localhost:11435 — the real Ollama; the interceptor listens on 11434)
  thresholds: {              // safe defaults from shared-types SecurityThresholds
    malformedThreshold: number      // default 100
    detectionWindowUs: number       // default 1_000_000
    gridThreatGbps: number          // default 10
    gridThreatWindowUs: number      // default 1_000_000
  }
  zones: string[]            // deployment zones (default ["default"])
  installDir: string         // target install dir (default ~/alygn)
  serviceUser: string        // systemd User (default current user)
  licenseAccepted: boolean   // must be true to proceed
  verifyEnabled: boolean     // KILL_SWITCH_VERIFY_ENABLED (default false)
  verifyModel: string        // KILL_SWITCH_VERIFIER_MODEL (default qwen2.5:0.5b)
}
```

## 4. Target `.env` layout (written with mode 0600, never echoed)

Server env (apps/server-kill-switch):

```
BETTER_AUTH_SECRET        # from generate-secrets.sh
KILL_SWITCH_AUTH_TOKEN    # from generate-secrets.sh (or adminPassword)
KILL_SWITCH_API_KEY       # from generate-secrets.sh
AUDIT_HMAC_KEY            # from generate-secrets.sh
ADMIN_UI_API_KEY          # from generate-secrets.sh
KILL_SWITCH_INTERNAL_KEY  # from generate-secrets.sh
KILL_SWITCH_ENV=production
KILL_SWITCH_PORT=3000
BETTER_AUTH_URL=http://localhost:3000
ADMIN_EMAIL=<adminEmail>
REDIS_URL=<redisUrl>
WEBAUTHN_RP_ID=<webauthnRpId>
WEBAUTHN_ORIGIN=<webauthnOrigin>
ALYGN_MACHINE_HOSTNAME=<machineHostname>
ALYGN_MACHINE_NAME=<machineName>
KILL_SWITCH_DISCOVERY_OLLAMA_BASE_URL=<ollamaBaseUrl>
KILL_SWITCH_VERIFIER_BASE_URL=<ollamaBaseUrl>
KILL_SWITCH_VERIFIER_MODEL=<verifyModel>
KILL_SWITCH_VERIFY_ENABLED=<verifyEnabled>
KILL_SWITCH_VERIFY_MODE=async
```

Agent env (apps/agent-plane):

```
ALYGN_MOTHER_URL=<motherUrl>
ALYGN_AGENT_API_KEY=<KILL_SWITCH_API_KEY value>
ALYGN_MACHINE_ID=<machineId>
ALYGN_MACHINE_NAME=<machineName>
ALYGN_MACHINE_HOSTNAME=<machineHostname>
ALYGN_HEARTBEAT_INTERVAL_MS=30000
OLLAMA_BASE_URL=<ollamaBaseUrl>   # real Ollama (default http://localhost:11435)
OLLAMA_INTERCEPT_PORT=11434        # interceptor listens on the client-facing port, forwards to OLLAMA_BASE_URL
LOG_LEVEL=info
```

## 5. lib API — be-coder exports exactly these

```ts
// system.ts
detectSystem(): Promise<SystemReport>
// SystemReport: { os, kernel, arch, systemd: boolean, bun: { installed, version } | null,
//   redis: { installed, running } | null, git: { installed, version } | null,
//   ports: { 3000: 'free'|'used', 3001: 'free'|'used' },
//   hardware: { cpu, cores, memMb }, issues: Array<{ severity: 'error'|'warn', message, remediation }> }

// config.ts
loadConfig(opts: { configPath?: string; interactive: boolean }): Promise<WizardConfig>
validateConfig(cfg: unknown): WizardConfig   // zod parse, throws with readable errors

// env.ts
writeEnvFile(config: WizardConfig, target: string): Promise<{ path: string; mode: number }>
generateSecrets(targetEnv: string): Promise<{ generated: string[]; skipped: string[] }>
//   runs apps/server-kill-switch/scripts/security/generate-secrets.sh <targetEnv>

// services.ts
installServices(config: WizardConfig): Promise<InstallResult>
//   InstallResult: { units: string[]; enabled: boolean; started: boolean }
uninstallServices(config: WizardConfig): Promise<UninstallResult>

// installer.ts
runMigrations(config: WizardConfig): Promise<{ ok: boolean; output: string }>
install(config: WizardConfig): Promise<InstallResult>   // env → secrets → units → migrate → start

// verifier.ts
verifyInstall(config: WizardConfig): Promise<VerificationReport>
//   VerificationReport: { api: { ok, status?, version? }, redis: { ok }, machines: unknown[],
//     auditLog: { ok }, heartbeat: { state?, agentRegistered? } | null }
probeHeartbeat(config: WizardConfig): Promise<{ state: string; agentRegistered: boolean }>

// uninstaller.ts
uninstall(config: WizardConfig, opts: { purge: boolean }): Promise<UninstallResult>
```

## 6. Mother API contracts (already live, do not change)

- `POST /v1/discovery/heartbeat` — header `x-api-key: <KILL_SWITCH_API_KEY>`; body `{ machineId, hostname, agentId, agentName, agentVersion, capabilities, fingerprint? }`; 200 `{ acknowledged, machineId, signature?, drift?, state, agentRegistered? }`; 403 `HOSTNAME_MISMATCH`.
- `GET /v1/discovery/machines?state=NEW_MACHINE` — admin auth; `{ data: DiscoveredMachine[], total, limit }`.
- `POST /v1/discovery/:machineId/confirm` — admin auth; body `{ approve: true }`; 200 `{ machine, state, note }`.
- `GET /v1/discovery/integrity-events` — admin auth; `{ data, total }`.

Heartbeat flow: agent heartbeats → machine enters `NEW_MACHINE` → admin confirms in dashboard → heartbeat flows. **No auto-admission (ADR-135 §5).**

## 7. systemd units

Base on repo-root `alygn-web-regulator.service` / `alygn-web-regulator-bun.service`. Parameterize `User`, `WorkingDirectory`, `ExecStart`, `Environment`. Both units load the install `.env` via `EnvironmentFile=<installDir>/.env` (Bun does not auto-load parent-dir .env — the server's `validateEnvironment()` and the agent's API-key check would fail without it). Install to `/etc/systemd/system/`:

- `alygn-web-regulator.service` — kill-switch server (bun run src/index.ts)
- `alygn-agent-plane.service` — agent heartbeat + interceptor

## 8. CLI contract

```
wizard [--config <path>] [--dry-run] [--yes] [uninstall [--purge]]
```

- Default: interactive clack flow (preflight → configure → install → verify → handoff).
- `--config <path>`: non-interactive replay from JSON file (acceptance criterion).
- `--dry-run`: preflight + config validation only, no writes.
- `uninstall [--purge]`: stop/disable/remove units; `--purge` also deletes `.env` + data dir.
- Exit codes: `0` ok · `1` preflight fail · `2` config invalid · `3` install fail · `4` verify fail.

## 9. install.sh bootstrap (Epic 1.5)

`curl -fsSL <release-url>/install.sh | bash`:

1. Verify script SHA-256 against published checksum (embedded + fetched).
2. Download release tarball, verify checksum, extract to `installDir`.
3. `bun install` (or `bun install --production`).
4. Exec `bun run wizard` with args passed through (root `package.json` exposes `wizard` → `bun --filter @alygn/wizard-tui wizard`).

Release artifacts (`alygn-wizard-tui.tar.gz`, `alygn-wizard-tui.tar.gz.sha256`, `install.sh.sha256`) are published by `.github/workflows/release.yml` on every `v*` tag push.

## 10. Commit rules (ALL commits)

- Conventional commits (`feat(wizard-tui): …`, `fix(wizard-tui): …`, `test(wizard-tui): …`).
- Every commit ends with trailers:

```
Co-authored-by: AndlerRL <35474730+AndlerRL@users.noreply.github.com>
Worked on by:
- @AndlerRL
```

- Work in the assigned worktree only, branch `feat/wizard-tui`. No new branches, no checkout.
