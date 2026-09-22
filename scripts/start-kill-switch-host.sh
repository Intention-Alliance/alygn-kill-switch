#!/bin/bash
# Kill Switch host launcher — runs the kill-switch server natively on the host
# (Docker's Bun.serve() binding issue workaround — the server binds 0.0.0.0:3000
# correctly when run directly on the host).
set -euo pipefail

cd /home/andlersrv/.openclaw/workspace-qa-tester/repos/Intention-Alliance/alygn-core-infra

# Load secrets from the .env (never echo values)
set -a
source .env
set +a

# Ensure required secrets exist
: "${BETTER_AUTH_SECRET:?BETTER_AUTH_SECRET required}"
: "${KILL_SWITCH_AUTH_TOKEN:?KILL_SWITCH_AUTH_TOKEN required}"
: "${KILL_SWITCH_API_KEY:?KILL_SWITCH_API_KEY required}"
: "${AUDIT_HMAC_KEY:?AUDIT_HMAC_KEY required}"

export KILL_SWITCH_ENV=production
export KILL_SWITCH_PORT=3000
export BETTER_AUTH_URL=http://localhost:3000
export ADMIN_EMAIL=admin@alygn.com
export REDIS_URL=redis://localhost:6390
export WEBAUTHN_RP_ID=andlersrv.tail62d797.ts.net
export WEBAUTHN_ORIGIN=https://andlersrv.tail62d797.ts.net:8443
export ALYGN_MACHINE_HOSTNAME=andlersrv.tail62d797.ts.net
export ALYGN_MACHINE_NAME=andlersrv
export KILL_SWITCH_DISCOVERY_OLLAMA_BASE_URL=http://localhost:11434
export KILL_SWITCH_VERIFIER_BASE_URL=http://localhost:11434
export KILL_SWITCH_VERIFIER_MODEL=qwen2.5:0.5b
export KILL_SWITCH_VERIFY_ENABLED=true
export KILL_SWITCH_VERIFY_MODE=async

exec bun run apps/server-kill-switch/src/index.ts