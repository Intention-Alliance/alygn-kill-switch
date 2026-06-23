#!/bin/bash
#
# Standalone Job Automation Runner
# Can be called directly or via cron. Handles logging, env setup, failure alerts.
#

set -euo pipefail

WORKSPACE="${WORKSPACE:-$HOME/.openclaw/workspace}"
SCRIPT="$WORKSPACE/scripts/jobs/job-automation.js"
LOG_FILE="$WORKSPACE/data/jobs/automation.log"
RECIPIENT="${NOTIFY_RECIPIENT:-+50662163355}"

# Chrome DevTools Protocol port. The OpenClaw-managed Chrome runs on 18801
# (user-data-dir=/home/andlersrv/.openclaw/browser/openclaw/user-data). The
# scrapers also read this env var via config.json. Default flipped from 18802
# to 18801 on 2026-06-23 so the cron and the OpenClaw browser agree.
CHROME_DEBUG_PORT="${CHROME_DEBUG_PORT:-18801}"
CHROME_USER_DATA_DIR="${CHROME_USER_DATA_DIR:-$WORKSPACE/data/jobs/.chrome-profile}"
CHROME_PID_FILE="$WORKSPACE/data/jobs/.chrome.pid"

# Ensure directories exist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$CHROME_USER_DATA_DIR"

# Log header
echo "=== $(date -Iseconds) Job Automation Started ===" >> "$LOG_FILE"

ensure_browser() {
  # Reuse an already-running instance on the debug port (e.g. user-launched Chrome).
  if curl -sf --max-time 2 "http://127.0.0.1:${CHROME_DEBUG_PORT}/json/version" >/dev/null 2>&1; then
    echo "[$(date -Iseconds)] Browser already alive on :${CHROME_DEBUG_PORT} — reusing" >> "$LOG_FILE"
    return 0
  fi
  # If a stale PID file is around, clean it.
  if [ -f "$CHROME_PID_FILE" ]; then
    OLD_PID="$(cat "$CHROME_PID_FILE" 2>/dev/null || true)"
    if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null; then
      echo "[$(date -Iseconds)] Killing stale chrome pid $OLD_PID" >> "$LOG_FILE"
      kill "$OLD_PID" 2>/dev/null || true
      sleep 1
    fi
    rm -f "$CHROME_PID_FILE"
  fi
  # Pick a binary: chromium first (Arch default), then google-chrome, then chrome.
  local CHROME_BIN=""
  for cand in chromium google-chrome chrome chromium-browser; do
    if command -v "$cand" >/dev/null 2>&1; then CHROME_BIN="$cand"; break; fi
  done
  if [ -z "$CHROME_BIN" ]; then
    echo "[$(date -Iseconds)] ERROR: no chromium/chrome binary found" >> "$LOG_FILE"
    return 1
  fi
  echo "[$(date -Iseconds)] Launching $CHROME_BIN headless on :${CHROME_DEBUG_PORT} (profile=$CHROME_USER_DATA_DIR)" >> "$LOG_FILE"
  nohup "$CHROME_BIN" \
    --headless=new \
    --disable-gpu \
    --no-sandbox \
    --disable-dev-shm-usage \
    --remote-debugging-port="$CHROME_DEBUG_PORT" \
    --remote-debugging-address=127.0.0.1 \
    --user-data-dir="$CHROME_USER_DATA_DIR" \
    --window-size=1920,1080 \
    about:blank \
    >> "$WORKSPACE/data/jobs/chrome.log" 2>&1 &
  echo $! > "$CHROME_PID_FILE"
  # Wait for the debug port to come up (max ~15s).
  for i in $(seq 1 30); do
    if curl -sf --max-time 1 "http://127.0.0.1:${CHROME_DEBUG_PORT}/json/version" >/dev/null 2>&1; then
      echo "[$(date -Iseconds)] Browser ready (pid=$(cat "$CHROME_PID_FILE"))" >> "$LOG_FILE"
      return 0
    fi
    sleep 0.5
  done
  echo "[$(date -Iseconds)] ERROR: browser failed to come up on :${CHROME_DEBUG_PORT}" >> "$LOG_FILE"
  return 1
}

stop_managed_browser() {
  # Only stop Chrome that we launched (PID file present). Leave user-launched Chrome alone.
  if [ -f "$CHROME_PID_FILE" ]; then
    local PID
    PID="$(cat "$CHROME_PID_FILE" 2>/dev/null || true)"
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      echo "[$(date -Iseconds)] Stopping managed chrome pid $PID" >> "$LOG_FILE"
      kill "$PID" 2>/dev/null || true
      sleep 1
      kill -9 "$PID" 2>/dev/null || true
    fi
    rm -f "$CHROME_PID_FILE"
  fi
}

# Make sure a debuggable browser is running.
ensure_browser || { echo "[$(date -Iseconds)] Browser bring-up failed — proceeding anyway (browser scrapers will skip)" >> "$LOG_FILE"; }

# Run automation
if node "$SCRIPT" >> "$LOG_FILE" 2>&1; then
  echo "=== $(date -Iseconds) Job Automation Success ===" >> "$LOG_FILE"
  stop_managed_browser || true
  exit 0
else
  EXIT_CODE=$?
  echo "=== $(date -Iseconds) Job Automation FAILED (exit $EXIT_CODE) ===" >> "$LOG_FILE"
  stop_managed_browser || true

  # Failure alert via WhatsApp (best-effort) — uses spawnSync with ESM import
  FAIL_MSG="⚠️ Job Scraper FAILED at $(date). Exit code: $EXIT_CODE. Check logs: $LOG_FILE"
  node --input-type=module -e "
    import { spawnSync } from 'child_process';
    const msg = process.argv[1];
    const r = spawnSync('openclaw', ['message', 'send', '--target', '+50662163355', '--message', msg, '--channel', 'whatsapp'], { encoding: 'utf8', timeout: 15000 });
    process.exit(r.status !== 0 ? 1 : 0);
  " "$FAIL_MSG" 2>&1 || true

  exit $EXIT_CODE
fi
