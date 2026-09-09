# Alygn Agent Plane

The Kill Switch agent: heartbeat, integrity fingerprinting, Ollama
interception, and local enforcement. Runs on every guarded machine and
reports to the mother machine (server-kill-switch).

## Architecture

```
┌─────────────────────────────┐        POST /v1/discovery/heartbeat
│  Agent Plane (this app)     │ ────────────────────────────────►  Mother
│                             │        GET  /v1/kill-switch/status
│  ┌───────────┐  ┌────────┐ │ ◄──────────────────────────────── (kill-switch)
│  │ heartbeat │  │enforce-│ │
│  │  client   │  │  ment  │ │
│  └───────────┘  └────────┘ │
│  ┌───────────────────────┐  │
│  │ Ollama interceptor   │  │   listens :11435 → forwards :11434
│  │ (reverse proxy+score)│  │
│  └───────────────────────┘  │
│  ┌───────────────────────┐  │
│  │ local state (SQLite)  │  │   WAL, survives restarts
│  └───────────────────────┘  │
└─────────────────────────────┘
```

- **heartbeat.ts** — 30s liveness loop with exponential backoff on
  failure (1s → 2s → … capped at 60s, reset on success).
- **integrity.ts** — hardware fingerprint (CPU, cores, memory, GPU via
  lspci, disk, OS, MACs) + drift detection. MACs are read by expanding
  `/sys/class/net/*` with `readdirSync` (a literal glob never expands
  under `Bun.spawn`).
- **interceptor.ts** — reverse proxy on `:11435` → real Ollama
  (`:11434`), keyword scoring, and a local enforcement gate: when the
  kill-switch is paused, inference requests get `503 + Retry-After: 5`
  instead of being forwarded.
- **enforcement.ts** — Enforcement Consumer: polls the mother's
  `GET /v1/kill-switch/status` and exposes `isPaused()`. Fail-closed
  until the first successful poll.
- **state.ts** — SQLite (WAL) local store: last kill-switch state, last
  heartbeat, last fingerprint.

## Install

### systemd (host)

```bash
sudo ./install.sh --user <user> --mother-url http://localhost:3000
# prompts for ALYGN_AGENT_API_KEY (matches KILL_SWITCH_API_KEY on the mother)
```

Or copy `alygn-agent-plane.service` to `/etc/systemd/system/`, fill in
the user/paths, create the secrets file, then:

```bash
sudo sh -c 'umask 077; echo "ALYGN_AGENT_API_KEY=***" > /etc/alygn-agent-plane.env'
sudo systemctl daemon-reload
sudo systemctl enable --now alygn-agent-plane
journalctl -u alygn-agent-plane -f
```

The API key is loaded from `/etc/alygn-agent-plane.env` (0600) via
`EnvironmentFile=` — never inline it in the unit file, which is world
readable (644).

### Docker

```bash
docker build -f apps/agent-plane/Dockerfile -t alygn-agent-plane .
docker run -d --name alygn-agent-plane \
  -e ALYGN_MOTHER_URL=http://host.docker.internal:3000 \
  -e ALYGN_AGENT_API_KEY=*** \
  -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
  -p 11435:11435 \
  alygn-agent-plane
```

## Configuration

See `.env.example`. Key contract:

| Variable | Default | Meaning |
|---|---|---|
| `ALYGN_MOTHER_URL` | `http://localhost:3000` | Mother kill-switch server |
| `ALYGN_AGENT_API_KEY` | — (required) | Matches mother's `KILL_SWITCH_API_KEY` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Real Ollama (upstream) |
| `OLLAMA_INTERCEPT_PORT` | `11435` | Port the agent listens on |
| `ALYGN_ENFORCE_POLL_INTERVAL_MS` | `5000` | Kill-switch status poll |
| `ALYGN_STATE_DB` | `./data/agent-state.sqlite` | Local SQLite (WAL) |

## Tests

```bash
bun test
```

- `heartbeat.e2e.test.ts` — live heartbeat against the real mother
  (skipped when `ALYGN_MOTHER_URL`/`ALYGN_AGENT_API_KEY` are unset).
- `integrity.test.ts` — MAC glob expansion + drift detection.
- `heartbeat.test.ts` — retry/backoff behavior.
- `enforcement.test.ts` — fail-closed + state transitions.
- `state.test.ts` — SQLite WAL persistence.
