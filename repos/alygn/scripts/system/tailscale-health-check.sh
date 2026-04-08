#!/bin/bash
# tailscale-health-check.sh
# Health check script for Tailscale persistence monitoring
# Created: 2026-04-07
# Part of: Issue #86 - Tailscale Persistence Fix

set -euo pipefail

LOG_FILE="/tmp/tailscale-health.log"
LOCK_FILE="/tmp/tailscale-health.lock"
DISCORD_WEBHOOK="${DISCORD_WEBHOOK_URL:-}"
TS_HOST="100.64.0.1"  # CGNAT range typically used by Tailscale
TS_PORT=41641
MAX_FAILURES=3
FAILURE_COUNT=0

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_tailscale() {
    # Check if tailscaled process is running
    if ! pgrep -x tailscaled > /dev/null 2>&1; then
        log "FAIL: tailscaled process not running"
        return 1
    fi

    # Check if Tailscale daemon socket is responsive
    if ! timeout 5 tailscale status --json > /dev/null 2>&1; then
        log "FAIL: Tailscale status check failed"
        return 1
    fi

    # Check if we can reach the Tailscale IP
    if ! timeout 3 nc -z "$TS_HOST" "$TS_PORT" 2>/dev/null; then
        log "WARN: Cannot reach Tailscale UDP port $TS_PORT"
        # Note: userspace mode may not have the TUN interface, so this check is advisory
    fi

    log "OK: Tailscale is healthy"
    return 0
}

restart_tailscale() {
    log "Attempting to restart tailscaled..."
    systemctl restart tailscaled
    sleep 5
    if pgrep -x tailscaled > /dev/null 2>&1; then
        log "OK: tailscaled restarted successfully"
        return 0
    else
        log "ERROR: tailscaled restart failed"
        return 1
    fi
}

send_alert() {
    local message="$1"
    log "ALERT: $message"
    
    if [[ -n "$DISCORD_WEBHOOK" ]]; then
        curl -s -X POST "$DISCORD_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"content\": \"🚨 Tailscale Health Alert: $message\"}" \
            || log "WARN: Failed to send Discord alert"
    fi
}

main() {
    log "=== Tailscale Health Check Started ==="
    
    # Check if we're in a cooldown period (prevent alert spam)
    if [[ -f "$LOCK_FILE" ]]; then
        local lock_age=$(($(date +%s) - $(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0)))
        if [[ $lock_age -lt 300 ]]; then  # 5 minute cooldown
            log "SKIP: Health check already ran recently (cooldown active)"
            exit 0
        fi
    fi
    
    if check_tailscale; then
        FAILURE_COUNT=0
        touch "$LOCK_FILE"
        exit 0
    else
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        log "FAILURE_COUNT: $FAILURE_COUNT/$MAX_FAILURES"
        
        if [[ $FAILURE_COUNT -ge $MAX_FAILURES ]]; then
            send_alert "Tailscale health check failed $MAX_FAILURES times consecutively"
            if restart_tailscale; then
                send_alert "Tailscale auto-restarted successfully"
            else
                send_alert "CRITICAL: Tailscale auto-restart FAILED - manual intervention required"
            fi
            FAILURE_COUNT=0
        fi
        exit 1
    fi
}

main "$@"
