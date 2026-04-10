#!/bin/bash
# backup-3-2-1.sh - 3-2-1 Backup Strategy Implementation
# Issue #111 - Business Continuity Plan
# Created: $(date +%Y-%m-%d)

set -euo pipefail

# Configuration
BACKUP_BASE_DIR="/var/backups/3-2-1"
S3_BUCKET="${S3_BACKUP_BUCKET:-s3://company-backups}"
GCS_BUCKET="${GCS_BACKUP_BUCKET:-gs://company-backups-offsite}"
SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-}"
NOTION_TOKEN="${NOTION_TOKEN:-}"
LOG_FILE="/var/log/backup-3-2-1.log"
RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=12

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Error handler
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Create backup directories
setup_dirs() {
    mkdir -p "$BACKUP_BASE_DIR"/{daily,weekly,monthly,notion,temp}
    log "Backup directories initialized"
}

# Supabase PostgreSQL Backup
backup_supabase() {
    local backup_type=$1
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="supabase_${backup_type}_${timestamp}.sql.gz"
    local backup_path="$BACKUP_BASE_DIR/$backup_type/$backup_file"

    log "Starting Supabase PostgreSQL backup: $backup_file"

    if [[ -z "$SUPABASE_URL" ]] || [[ -z "$SUPABASE_SERVICE_KEY" ]]; then
        log "WARNING: Supabase credentials not configured, skipping database backup"
        return 0
    fi

    # Extract connection details from Supabase URL
    local db_host=$(echo "$SUPABASE_URL" | sed -E 's/.*@([^/]+).*/\1/')
    local db_name="postgres"

    # Perform pg_dump via Supabase connection
    PGPASSWORD="$SUPABASE_SERVICE_KEY" pg_dump \
        -h "$db_host" \
        -U postgres \
        -d "$db_name" \
        --clean \
        --if-exists \
        --no-owner \
        --no-privileges \
        2>/dev/null | gzip > "$backup_path" || {
        log "WARNING: Supabase backup failed, continuing..."
        return 0
    }

    local size=$(du -h "$backup_path" 2>/dev/null | cut -f1)
    log "Supabase backup completed: $backup_file ($size)"

    # Upload to primary (S3)
    upload_to_s3 "$backup_path" "$backup_type"

    # Copy to offsite (GCS)
    copy_to_gcs "$backup_path" "$backup_type"
}

# Notion Export Backup
backup_notion() {
    local backup_type=$1
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="$BACKUP_BASE_DIR/$backup_type/notion_${timestamp}"

    log "Starting Notion export backup"

    if [[ -z "$NOTION_TOKEN" ]]; then
        log "WARNING: Notion token not configured, skipping Notion backup"
        return 0
    fi

    mkdir -p "$backup_dir"

    # Export Notion pages using Notion API
    # This requires notion-export tool or custom API calls
    # Using a simplified approach with curl

    local pages_file="$backup_dir/pages.json"
    curl -s -X GET \
        "https://api.notion.com/v1/search" \
        -H "Authorization: Bearer $NOTION_TOKEN" \
        -H "Notion-Version: 2022-06-28" \
        -H "Content-Type: application/json" \
        -o "$pages_file" 2>/dev/null || {
        log "WARNING: Notion API backup failed, continuing..."
        rm -rf "$backup_dir"
        return 0
    }

    # Create archive
    local archive_file="${backup_dir}.tar.gz"
    tar -czf "$archive_file" -C "$BACKUP_BASE_DIR/$backup_type" "notion_${timestamp}" 2>/dev/null
    rm -rf "$backup_dir"

    local size=$(du -h "$archive_file" 2>/dev/null | cut -f1)
    log "Notion backup completed: notion_${timestamp}.tar.gz ($size)"

    # Upload to primary (S3)
    upload_to_s3 "$archive_file" "$backup_type"

    # Copy to offsite (GCS)
    copy_to_gcs "$archive_file" "$backup_type"
}

# Upload to S3 (Primary Storage)
upload_to_s3() {
    local file=$1
    local backup_type=$2
    local filename=$(basename "$file")

    log "Uploading to S3: $filename"

    if command -v aws &>/dev/null; then
        aws s3 cp "$file" "$S3_BUCKET/$backup_type/$filename" --storage-class STANDARD_IA 2>/dev/null || \
            log "WARNING: S3 upload failed for $filename"
    else
        log "WARNING: AWS CLI not found, skipping S3 upload"
    fi
}

# Copy to GCS (Offsite Storage)
copy_to_gcs() {
    local file=$1
    local backup_type=$2
    local filename=$(basename "$file")

    log "Copying to GCS (offsite): $filename"

    if command -v gsutil &>/dev/null; then
        gsutil cp "$file" "$GCS_BUCKET/$backup_type/$filename" 2>/dev/null || \
            log "WARNING: GCS upload failed for $filename"
    else
        log "WARNING: gsutil not found, skipping GCS upload"
    fi
}

# Cleanup old backups based on retention policy
cleanup_old_backups() {
    local backup_type=$1
    local retention=$2

    log "Cleaning up old $backup_type backups (retention: $retention)"

    # Local cleanup
    find "$BACKUP_BASE_DIR/$backup_type" -name "*.gz" -type f -mtime +$retention -delete 2>/dev/null || true

    # S3 cleanup
    if command -v aws &>/dev/null; then
        aws s3 ls "$S3_BUCKET/$backup_type/" 2>/dev/null | \
            awk '{print $4}' | \
            while read -r file; do
                local file_date=$(echo "$file" | grep -oE '[0-9]{8}' || echo "")
                if [[ -n "$file_date" ]]; then
                    local file_epoch=$(date -d "$file_date" +%s 2>/dev/null || echo 0)
                    local cutoff_epoch=$(date -d "$retention days ago" +%s)
                    if [[ $file_epoch -lt $cutoff_epoch ]]; then
                        aws s3 rm "$S3_BUCKET/$backup_type/$file" 2>/dev/null || true
                    fi
                fi
            done
    fi
}

# Main backup function
run_backup() {
    local backup_type=$1

    log "=== Starting $backup_type backup ==="

    setup_dirs
    backup_supabase "$backup_type"
    backup_notion "$backup_type"

    case $backup_type in
        daily)
            cleanup_old_backups "daily" $RETENTION_DAILY
            ;;
        weekly)
            cleanup_old_backups "weekly" $RETENTION_WEEKLY
            ;;
        monthly)
            cleanup_old_backups "monthly" $RETENTION_MONTHLY
            ;;
    esac

    log "=== $backup_type backup completed ==="
}

# Determine backup type from day
get_backup_type() {
    local day_of_month=$(date +%d)
    local day_of_week=$(date +%u)

    if [[ "$day_of_month" == "01" ]]; then
        echo "monthly"
    elif [[ "$day_of_week" == "7" ]]; then
        echo "weekly"
    else
        echo "daily"
    fi
}

# Main execution
main() {
    local backup_type=${1:-$(get_backup_type)}

    log "Backup script started (type: $backup_type)"

    case $backup_type in
        daily|weekly|monthly)
            run_backup "$backup_type"
            ;;
        all)
            run_backup "daily"
            run_backup "weekly"
            run_backup "monthly"
            ;;
        *)
            echo "Usage: $0 [daily|weekly|monthly|all]"
            exit 1
            ;;
    esac

    log "Backup script completed successfully"
}

main "$@"
