#!/usr/bin/env bash
# Agent Plane installer — installs the agent as a systemd service.
#
# Usage: sudo ./install.sh [--user <user>] [--mother-url <url>] [--api-key <key>]
#
# Defaults:
#   user       = the invoking user (must have sudo)
#   mother-url = http://localhost:3000
#   api-key    = read from ALYGN_AGENT_API_KEY env, or prompted
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICE_NAME="alygn-agent-plane"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
DATA_DIR="/var/lib/alygn-agent-plane"

USER_NAME="${1:-$USER}"
MOTHER_URL="${ALYGN_MOTHER_URL:-http://localhost:3000}"
API_KEY="${ALYGN_AGENT_API_KEY:-}"

if [[ -z "$API_KEY" ]]; then
  read -r -s -p "ALYGN_AGENT_API_KEY (matches KILL_SWITCH_API_KEY on the mother): " API_KEY
  echo
fi
if [[ -z "$API_KEY" ]]; then
  echo "error: API key required" >&2
  exit 1
fi

# Resolve the user's home for the bun shim path
USER_HOME="$(getent passwd "$USER_NAME" | cut -d: -f6)"
if [[ -z "$USER_HOME" ]]; then
  echo "error: unknown user $USER_NAME" >&2
  exit 1
fi
BUN_SHIM="${USER_HOME}/.local/share/mise/shims/bun"
if [[ ! -x "$BUN_SHIM" ]]; then
  BUN_SHIM="$(command -v bun || true)"
fi
if [[ -z "$BUN_SHIM" ]]; then
  echo "error: bun not found for user $USER_NAME" >&2
  exit 1
fi

# Local state directory (SQLite WAL)
mkdir -p "$DATA_DIR"
chown "$USER_NAME":"$USER_NAME" "$DATA_DIR"

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=ALYGN Agent Plane (Kill Switch agent)
After=network.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$REPO_DIR/apps/agent-plane
ExecStart=$BUN_SHIM run $REPO_DIR/apps/agent-plane/src/index.ts
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=ALYGN_MOTHER_URL=$MOTHER_URL
Environment=ALYGN_AGENT_API_KEY=$API_KEY
Environment=ALYGN_STATE_DB=$DATA_DIR/agent-state.sqlite
Environment=OLLAMA_BASE_URL=http://localhost:11434
Environment=OLLAMA_INTERCEPT_PORT=11435
Environment=LOG_LEVEL=info

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"

echo "Installed $SERVICE_NAME (systemd)."
echo "  Service file: $SERVICE_FILE"
echo "  State DB:     $DATA_DIR/agent-state.sqlite"
echo "  Logs:         journalctl -u $SERVICE_NAME -f"
