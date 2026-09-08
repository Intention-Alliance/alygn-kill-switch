# Contributing to the Alygn Kill Switch

First, thank you. A control layer whose purpose is protecting human dignity must be built and verified by the communities it affects — not only by the industry that commercializes it. Every contribution, from a typo fix to a Rust enforcement module, moves that mission forward.

Before you start, read the [Manifesto](MANIFESTO.md) — it explains why this system exists and the principles it will not compromise.

## The Golden Rules

1. **Safety-critical paths are held to a higher bar.** Code in scoring, enforcement, and the audit writer requires review from a maintainer before merge, full test coverage, and a justification comment for every non-obvious decision.
2. **Honesty about maturity.** The project distinguishes strictly between *deployed* and *designed*. Never document a designed capability as if it were running. The whitepaper's built-vs-designed table is the canonical framing.
3. **Never commit secrets or live state.** No `.env` files, no session databases, no credentials, no tokens. The CI and maintainers will reject and may revoke access for violations.
4. **Auditability is sacred.** Any change that touches authorization, audit logging, or verification logic requires an ADR reference and maintainer review.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Bun (strict — no npm) |
| Safety-critical | Rust (scoring, enforcement, audit writer) |
| Operational | TypeScript (dashboard, API, config) |
| Database | SQLite (WAL) per machine; PostgreSQL RLS for multi-tenant production |
| Real-time | WebSocket + Redis PubSub |
| Auth | Better-Auth + WebAuthn (hardware signatures, mandatory UV) |
| OS | Arch Linux |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- Linux (Arch Linux recommended for parity with production)
- Redis (for real-time state propagation)
- Git

### Setup

```bash
# Clone
git clone https://github.com/Intention-Alliance/alygn-core-infra.git
cd alygn-core-infra

# Install dependencies (Bun strict — do not use npm)
bun install

# Set up environment
cp apps/server-kill-switch/.env.example apps/server-kill-switch/.env
# Edit .env with your local values (see the file for required variables)

# Run database migrations
bun run db:migrate

# Start the kill-switch server (development)
bun run apps/server-kill-switch/src/index.ts

# Start the web-regulator dashboard (development)
bun run dev --filter=web-regulator
```

The dashboard lives at `http://localhost:3000` (ALYGN Regulator); the kill-switch API at `http://localhost:3001` (health check: `GET /api/health`).

### Verify your environment

```bash
curl http://localhost:3001/api/health
# Expected: {"status":"healthy","killSwitchState":"RUNNING","redis":{"redis":"OK"},...}
```

## How to Contribute

### 1. Find or create an issue

- Check [open issues](https://github.com/Intention-Alliance/alygn-core-infra/issues) labeled `good first issue` or `help wanted`.
- For new features, open a discussion first — especially for anything touching the enforcement path or the audit chain.

### 2. Branch and commit

```bash
git checkout -b feat/your-feature-name   # or fix/, docs/, chore/
```

We follow [Conventional Commits](https://www.conventionalcommits.org): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`. Commit messages are enforced by commitlint.

### 3. Test

```bash
bun test                          # full suite
bun test apps/server-kill-switch  # safety-critical package only
```

Safety-critical changes require new tests covering the change **and** its failure modes.

### 4. Submit a Pull Request

- PRs go through a two-stage review: automated checks (type-check, tests, security scan) then maintainer review.
- Safety-critical changes (scoring, enforcement, audit) require maintainer review — no self-merge, no exceptions.
- Describe *what* and *why*; the diff shows *how*. If your change affects the built-vs-designed status of any capability, say so explicitly in the PR description.

## Architecture Orientation

New contributors should read, in order:

1. **[MANIFESTO.md](MANIFESTO.md)** — why the system exists and its principles.
2. **[docs/KILL-SWITCH-SYSTEM-DESIGN.md](docs/KILL-SWITCH-SYSTEM-DESIGN.md)** — the system architecture.
3. **[docs/adr/](docs/adr/)** — Architecture Decision Records; ADR-133 (foundation) through ADR-146 (design synthesis) explain *why* the system is the way it is.
4. **[docs/api-contracts/](docs/api-contracts/)** — the locked API contracts.

The monorepo layout:

```
apps/
  server-kill-switch/   # Core service: discovery, scoring, authorization, audit
  web-regulator/        # Admin dashboard (Next.js, real-time WebSocket)
  dignity-verifier/     # Dignity Test evaluation runtime
  server-telemetry-handler/
  server-rdma-monitor/
  server-slashing-engine/
  smart-contracts/
packages/
  db-schema/            # Drizzle schema shared across apps
  shared-types/         # Canonical type definitions
```

## Security Vulnerabilities

**Do not open public issues for security vulnerabilities.** See [SECURITY.md](SECURITY.md) for the private disclosure process. Responsible disclosure is honored and credited.

## Community

- Behave by the [Code of Conduct](CODE_OF_CONDUCT.md).
- Design questions: open a GitHub Discussion with the `design` tag.
- The Dignity Test pilot program accepts universities, independent researchers, and technical communities — see the Manifesto for the participation model.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE) that covers this project.