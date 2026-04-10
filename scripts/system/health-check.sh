#!/bin/bash
# health-check.sh - Service Health Monitoring and RPO/RTO Detection
# Issue #111 - Business Continuity Plan
# Created: $(date +%Y-%m-%d)

set -euo pipefail

# Configuration
RPO_THRESHOLD_MINUTES=15
HEALTH_CHECK_INTERVAL=60
LOG_FILE="/var/log/health-check.log"
METRICS_FILE="/var/log/health-metrics.json"
ALERT_WEBHOOK="${ALERT_WEBHOOK_URL:-}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_KEY="${SUPABASE_KEY:-}"
NOTION_API_URL="https://api.notion.com/v1"
NOTION_TOKEN="${NOTION_TOKEN:-}"

# Service endpoints to check
declare -A SERVICES=(
    ["api"]="${API_HEALTH_URL:-http://localhost:3000/health}"
    ["database"]="${DB_HOST:-localhost}"
    ["cdn"]="${CDN_URL:-https://cdn.company.com}"
    ["auth"]="${AUTH_URL:-http://localhost:3000/auth/health}"
)

# State tracking
LAST_BACKUP_TIME=0
FAILOVER_START_TIME=0
RTO_ESTIMATED=0

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# JSON logging for metrics
log_metric() {
    local metric="$1"
    local value="$2"
    local timestamp=$(date +%s)
    
    echo "{\"timestamp\":$timestamp,\"metric\":\"$metric\",\"value\":$value}" >> "$METRICS_FILE"
}

# Send alert notification
send_alert() {
    local severity="$1"
    local message="$2"
    
    log "ALERT [$severity]: $message"
    
    if [[ -n "$ALERT_WEBHOOK" ]]; then
        curl -s -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"severity\":\"$severity\",\"message\":\"$message\",\"timestamp\":\"$(date -Iseconds)\"}" \
            2>/dev/null || log "Failed to send webhook alert"
    fi
}

# Check Supabase database health
check_supabase_health() {
    local status="healthy"
    local response_time=0
    
    if [[ -n "$SUPABASE_URL" ]] && [[ -n "$SUPABASE_KEY" ]]; then
        local start_time=$(date +%s%N)
        
        local http_status=$(curl -s -o /dev/null -w "%{http_code}" \
            "${SUPABASE_URL}/rest/v1/" \
            -H "apikey: $SUPABASE_KEY" \
            -H "Authorization: Bearer $SUPABASE_KEY" \
            --max-time 10 2>/dev/null || echo "000")
        
        local end_time=$(date +%s%N)
        response_time=$(( (end_time - start_time) / 1000000 ))  # Convert to ms
        
        if [[ "$http_status" != "200" ]]; then
            status="unhealthy"
            send_alert "critical" "Supabase API returned HTTP $http_status"
        fi
    else
        # Fallback: Check PostgreSQL directly
        if ! pg_isready -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -q 2>/dev/null; then
            status="unhealthy"
            send_alert "critical" "Database is not accepting connections"
        fi
    fi
    
    echo "{\"service\":\"supabase\",\"status\":\"$status\",\"response_time_ms\":$response_time}"
    log_metric "supabase_health" "$([ "$status" == "healthy" ] && echo 1 || echo 0)"
}

# Check Notion API health
check_notion_health() {
    local status="healthy"
    local response_time=0
    
    if [[ -n "$NOTION_TOKEN" ]]; then
        local start_time=$(date +%s%N)
        
        local http_status=$(curl -s -o /dev/null -w "%{http_code}" \
            "$NOTION_API_URL/users/me" \
            -H "Authorization: Bearer $NOTION_TOKEN" \
            -H "Notion-Version: 2022-06-28" \
            --max-time 10 2>/dev/null || echo "000")
        
        local end_time=$(date +%s%N)
        response_time=$(( (end_time - start_time) / 1000000 ))
        
        if [[ "$http_status" != "200" ]]; then
            status="unhealthy"
            send_alert "warning" "Notion API returned HTTP $http_status"
        fi
    else
        status="unknown"
    fi
    
    echo "{\"service\":\"notion\",\"status\":\"$status\",\"response_time_ms\":$response_time}"
    log_metric "notion_health" "$([ "$status" == "healthy" ] && echo 1 || echo 0)"
}

# Check generic HTTP service health
check_http_service() {
    local name="$1"
    local url="$2"
    
    local status="healthy"
    local response_time=0
    local http_status="000"
    
    local start_time=$(date +%s%N)
    
    http_status=$(curl -s -o /dev/null -w "%{http_code}" \
        "$url" \
        --max-time 10 2>/dev/null || echo "000")
    
    local end_time=$(date +%s%N)
    response_time=$(( (end_time - start_time) / 1000000 ))
    
    if [[ "$http_status" -lt 200 ]] || [[ "$http_status" -ge 300 ]]; then
        status="unhealthy"
        send_alert "critical" "Service $name returned HTTP $http_status"
    fi
    
    echo "{\"service\":\"$name\",\"status\":\"$status\",\"http_status\":$http_status,\"response_time_ms\":$response_time}"
    log_metric "${name}_health" "$([ "$status" == "healthy" ] && echo 1 || echo 0)"
}

# Check backup freshness (RPO detection)
check_backup_freshness() {
    local backup_dir="${BACKUP_DIR:-/var/backups/3-2-1}"
    local latest_backup=0
    local rpo_breach=false
    local minutes_since_backup=0
    
    # Find the most recent backup
    if [[ -d "$backup_dir" ]]; then
        latest_backup=$(find "$backup_dir" -name "*.gz" -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1 || echo 0)
    fi
    
    if [[ $latest_backup -gt 0 ]]; then
        local current_time=$(date +%s)
        minutes_since_backup=$(( (current_time - latest_backup) / 60 ))
        
        if [[ $minutes_since_backup -gt $RPO_THRESHOLD_MINUTES ]]; then
            rpo_breach=true
            send_alert "critical" "RPO BREACH: Last backup was $minutes_since_backup minutes ago (threshold: $RPO_THRESHOLD_MINUTES min)"
        fi
    else
        rpo_breach=true
        minutes_since_backup=9999
        send_alert "critical" "RPO BREACH: No backups found in $backup_dir"
    fi
    
    echo "{\"rpo_check\":{\"breach\":$rpo_breach,\"minutes_since_backup\":$minutes_since_backup,\"threshold\":$RPO_THRESHOLD_MINUTES}}"
    log_metric "rpo_breach" "$([ "$rpo_breach" == "true" ] && echo 1 || echo 0)"
}

# Estimate RTO based on current state
estimate_rto() {
    local rto_minutes=0
    local factors=()
    
    # Check if database needs recovery
    if ! pg_isready -h "${DB_HOST:-localhost}" -q 2>/dev/null; then
        rto_minutes=$((rto_minutes + 10))
        factors+=("database_recovery")
    fi
    
    # Check if services need restart
    for service in "${!SERVICES[@]}"; do
        local url="${SERVICES[$service]}"
        local status=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 5 2>/dev/null || echo "000")
        if [[ "$status" -lt 200 ]] || [[ "$status" -ge 300 ]]; then
            rto_minutes=$((rto_minutes + 2))
            factors+=("${service}_restart")
        fi
    done
    
    # Check CDN/cache status
    local cdn_status=$(curl -s -o /dev/null -w "%{http_code}" "${CDN_URL:-https://cdn.company.com}" --max-time 5 2>/dev/null || echo "000")
    if [[ "$cdn_status" != "200" ]]; then
        rto_minutes=$((rto_minutes + 5))
        factors+=("cdn_purge")
    fi
    
    # Base RTO if no issues detected
    if [[ $rto_minutes -eq 0 ]]; then
        rto_minutes=5
        factors+=("standard_failover")
    fi
    
    echo "{\"rto_estimate\":{\"minutes\":$rto_minutes,\"factors\":[\"${factors[*]}\"]}}"
    log_metric "rto_estimate_minutes" "$rto_minutes"
}

# Run all health checks
run_health_checks() {
    log "Starting health check cycle"
    
    local results=()
    
    # Check Supabase
    results+=("$(check_supabase_health)")
    
    # Check Notion
    results+=("$(check_notion_health)")
    
    # Check configured HTTP services
    for service in "${!SERVICES[@]}"; do
        results+=("$(check_http_service "$service" "${SERVICES[$service]}")")
    done
    
    # Check RPO
    results+=("$(check_backup_freshness)")
    
    # Estimate RTO
    results+=("$(estimate_rto)")
    
    # Output combined results
    echo "{\"timestamp\":\"$(date -Iseconds)\",\"checks\":[$(IFS=,; echo "${results[*]}")]}" | jq '.' 2>/dev/null || echo "${results[*]}"
    
    log "Health check cycle completed"
}

# Single check mode (for cron/monitoring)
single_check() {
    run_health_checks
}

# Continuous monitoring mode (daemon)
monitor_mode() {
    log "Starting continuous health monitoring (interval: ${HEALTH_CHECK_INTERVAL}s)"
    
    while true; do
        run_health_checks > /dev/null 2>&1 || true
        sleep "$HEALTH_CHECK_INTERVAL"
    done
}

# Main execution
main() {
    local mode="${1:-single}"
    
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE")"
    mkdir -p "$(dirname "$METRICS_FILE")"
    
    case "$mode" in
        single)
            single_check
            ;;
        monitor|daemon)
            monitor_mode
            ;;
        rpo)
            check_backup_freshness
            ;;
        rto)
            estimate_rto
            ;;
        *)
            echo "Usage: $0 [single|monitor|rpo|rto]"
            echo "  single  - Run health checks once (default)"
            echo "  monitor - Run continuous monitoring"
            echo "  rpo     - Check RPO status only"
            echo "  rto     - Estimate RTO only"
            exit 1
            ;;
    esac
}

main "$@"
