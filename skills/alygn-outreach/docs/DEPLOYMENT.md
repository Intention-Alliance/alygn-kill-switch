# Deployment Guide

> How to deploy, schedule, and operate the alygn-outreach skill in production.

---

## Deployment Options

### Option A: Direct Bun Process (Recommended for simplicity)

The skill runs as a standalone Bun process. Deploy by pulling the latest code and running via cron.

**Directory:** `/home/andlersrv/.openclaw/workspace/skills/alygn-outreach`

```bash
# Pull latest
cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach
git pull

# Update dependencies
bun install
```

**Cronjob entry example:**

```cron
# VC Discovery - Daily at 9:00 AM
0 9 * * * cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach && bun bin/alygn-outreach.ts --type=vc --action=discover --limit=20 --dry-run >> /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/logs/vc-discover.log 2>&1

# VC Personalize - Daily at 10:00 AM
0 10 * * * cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach && bun bin/alygn-outreach.ts --type=vc --action=personalize --limit=10 --dry-run >> /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/logs/vc-personalize.log 2>&1
```

### Option B: Systemd Service

For managed restarts and better logging:

```ini
# /etc/systemd/system/alygn-outreach-vc.service
[Unit]
Description=Alygn Outreach VC Pipeline
After=network.target

[Service]
Type=oneshot
User=andlersrv
WorkingDirectory=/home/andlersrv/.openclaw/workspace/skills/alygn-outreach
ExecStart=/usr/bin/bun bin/alygn-outreach.ts --type=vc --action=pipeline --limit=20
Environment=NODE_ENV=production
EnvironmentFile=/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/.env
StandardOutput=append:/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/logs/vc-pipeline.log
StandardError=append:/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/logs/vc-pipeline.error.log

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable alygn-outreach-vc.service
sudo systemctl start alygn-outreach-vc.service
```

### Option C: PM2 Process Manager

```bash
# Install PM2
npm install -g pm2

# Start the discovery as a daemon
pm2 start bun --name "alygn-vc-discover" -- \
  bin/alygn-outreach.ts --type=vc --action=discover --limit=20

# Set up auto-restart
pm2 save
pm2 startup
```

---

## Cronjob Setup

### Municipal Wave Architecture (6-Cronjob System)

Municipal outreach uses a wave-based batch system. Each wave follows this sequence:

```
research-wave → draft-wave → approve-wave → send-wave → track-wave → report-wave
```

#### Cronjob Schedule

| Cronjob         | Schedule     | Purpose                                |
| --------------- | ------------ | -------------------------------------- |
| `research-wave` | `0 9 * * *`  | Discover + research new municipalities |
| `draft-wave`    | `0 10 * * *` | Generate personalized email drafts     |
| `approve-wave`  | Manual       | Human review and approval in Notion    |
| `send-wave`     | `0 14 * * *` | Send approved emails                   |
| `track-wave`    | `0 * * * *`  | Monitor replies hourly                 |
| `report-wave`   | `0 8 * * 1`  | Weekly analytics report (Monday 8 AM)  |

#### Example Crontab

```cron
# Municipal Wave Cronjobs (Costa Rica)
# Research - 9:00 AM daily
0 9 * * * cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach && bun bin/alygn-outreach.ts --type=municipal --region=costa-rica --action=discover --limit=10 >> logs/muni-research.log 2>&1

# Draft - 10:00 AM daily
0 10 * * * cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach && bun bin/alygn-outreach.ts --type=municipal --region=costa-rica --action=personalize --limit=10 >> logs/muni-draft.log 2>&1

# Send - 2:00 PM daily
0 14 * * * cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach && bun bin/alygn-outreach.ts --type=municipal --action=send --draft-status=Approved >> logs/muni-send.log 2>&1

# Track - Every hour
0 * * * * cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach && bun bin/alygn-outreach.ts --type=municipal --action=validate --limit=50 >> logs/muni-track.log 2>&1

# VC Pipeline - 8:00 AM daily
0 8 * * * cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach && bun bin/alygn-outreach.ts --type=vc --action=pipeline --limit=20 >> logs/vc-pipeline.log 2>&1
```

#### Wave Cronjob Scripts

Create wrapper scripts for each wave phase for cleaner cron configuration:

```bash
#!/bin/bash
# scripts/municipal/research-wave.sh
export HOME=/home/andlersrv
export NODE_ENV=production

cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach

LOGFILE="logs/research-wave-$(date +\%Y-\%m-\%d).log"
ERRORFILE="logs/research-wave-$(date +\%Y-\%m-\%d).error.log"

echo "=== Wave research started at $(date) ===" >> $LOGFILE

bun bin/alygn-outreach.ts \
  --type=municipal \
  --region=costa-rica \
  --action=research \
  --limit=10 \
  >> $LOGFILE 2>> $ERRORFILE

echo "=== Wave research finished at $(date) ===" >> $LOGFILE
```

Make executable: `chmod +x scripts/municipal/research-wave.sh`

---

## Database Migrations

Migrations live in: `/home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/supabase/migrations/`

### Migration Files

| File                                         | Purpose                                                      |
| -------------------------------------------- | ------------------------------------------------------------ |
| `000_municipal_outreach_pipeline_schema.sql` | Core tables (municipalities, outreach_emails, x_engagements) |
| `001_local_government_outreach_schema.sql`   | Extended local government tables                             |
| `002_rollback_wave_tracking.sql`             | Rollback wave tracking changes                               |
| `003_add_wave_tracking.sql`                  | Wave tracking columns and checkpoints table                  |

### Running Migrations

#### Via Supabase CLI (local or production)

```bash
cd /home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/supabase

# Apply all pending migrations
supabase db push

# Reset and re-apply (destructive!)
supabase db reset

# Check migration status
supabase migration list
```

#### Manual SQL (production)

```bash
# Connect to Supabase
psql "postgres://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

# Apply a specific migration
\i /home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/supabase/migrations/003_add_wave_tracking.sql
```

### Key Tables

#### `municipalities`

The primary table for municipal entities. Contains contact info, pipeline status, and wave tracking.

```sql
-- Wave tracking columns (added by migration 003)
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS wave_number INTEGER DEFAULT 1;
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS batch_status TEXT DEFAULT 'researched';
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS wave_date DATE;
```

#### `checkpoints`

Tracks cronjob progress per wave for resumable processing.

```sql
CREATE TABLE checkpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wave_number INTEGER NOT NULL,
    wave_date DATE NOT NULL,
    cronjob_name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    last_processed_id UUID,
    processed_count INTEGER DEFAULT 0,
    total_count INTEGER,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_wave_cronjob UNIQUE (wave_number, cronjob_name)
);
```

### Adding a New Migration

```bash
cd /home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/supabase

# Create new migration
supabase migration new add_my_feature

# Edit the generated file
# ... write your SQL ...

# Push to production
supabase db push
```

---

## Monitoring and Logging

### Log Locations

```
alygn-outreach/
└── logs/
    ├── vc-discover.log
    ├── vc-personalize.log
    ├── vc-send.log
    ├── vc-pipeline.log
    ├── muni-research.log
    ├── muni-draft.log
    ├── muni-send.log
    └── research-wave-YYYY-MM-DD.log
```

### Structured Log Format

All log output is plain text console output. The cronjob wrapper scripts prefix entries with timestamps:

```
=== Wave research started at 2026-03-26 09:00:00 ===
🚀 Running MUNICIPAL pipeline: research
   Dry run: NO
   Limit: 10
   Region: costa-rica
...
=== Wave research finished at 2026-03-26 09:05:23 ===
```

### State Files

State is persisted to `$HOME/.openclaw/workspace/reports/alygn/{type}`:

```
/home/andlersrv/.openclaw/workspace/reports/alygn/{subFolderType}/alygn-{type}-{date}.json
```

#### State Directory Structure

```
alygn-outreach/
└── reports/
    └── alygn/
        ├── vc-campaign-resume-token.json
        ├── muni-cr-resume-token.json
        ├── vc-sync-result.json
        ├── vc-wave-state.json
        ├── muni-wave-state.json
        ├── vc-discover/
        │   └── alygn-vc-discovered-2026-03-26.json
        ├── vc-personalize/
        │   └── alygn-vc-personalized-2026-03-26.json
        ├── vc-research/
        │   └── alygn-vc-researched-2026-03-26.json
        ├── vc-personalize/
        │   └── alygn-vc-personalized-2026-03-26.json
        ├── vc-validate/
        │   └── alygn-vc-validated-2026-03-26.json
        ├── vc-sent/
        │    └── alygn-vc-sent-2026-03-26.json
        ├── muni-pipeline/
        │   └── alygn-muni-cr-pipeline-2026-03-26.json
        ├── muni-research/
        │   └── alygn-muni-cr-researched-2026-03-26.json
        ├── muni-personalize/
        │   └── alygn-muni-cr-personalized-2026-03-26.json
        ├── muni-research/
        │   └── alygn-muni-cr-researched-2026-03-26.json
        ├── muni-mayor/
        │   └── alygn-muni-cr-mayor-2026-03-26.json
        ├── muni-x-accounts/
        │   └── alygn-muni-cr-x-accounts-2026-03-26.json
        ├── muni-personalize/
        │   └── alygn-muni-cr-personalized-2026-03-26.json
        ├── muni-validate/
        │   └── alygn-muni-cr-validated-2026-03-26.json
        ├── muni-review/
        │   └── alygn-muni-cr-reviewed-2026-03-26.json
        └── muni-sent/
            └── alygn-muni-cr-sent-2026-03-26.json
```

**Examples:**

- `$HOME/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-2026-03-26.json`
- `$HOME/.openclaw/workspace/reports/alygn/muni-research/alygn-municipal-researched-2026-03-26.json`
- `$HOME/.openclaw/workspace/reports/alygn/vc-sent/alygn-vc-sent-2026-03-26.json`

### Health Checks

#### Checkpoint Monitoring

Query the `checkpoints` table to monitor cronjob health:

```sql
SELECT
  wave_number,
  cronjob_name,
  status,
  processed_count,
  total_count,
  error_message,
  started_at,
  completed_at,
  retry_count
FROM checkpoints
WHERE wave_number = 1
ORDER BY cronjob_name;
```

#### Quick Health Script

```bash
#!/bin/bash
# scripts/health-check.sh
echo "=== Alygn Outreach Health Check ==="
echo ""

echo "--- Recent State Files ---"
ls -la $HOME/.openclaw/workspace/reports/alygn/{subFolderType}/alygn-{type}-{phase}-{date}.json | tail -5

echo ""
echo "--- Running Processes ---"
ps aux | grep alygn-outreach | grep -v grep

echo ""
echo "--- Recent Errors (last 24h) ---"
find $HOME/.openclaw/workspace/skills/alygn-outreach/logs -name "*.error.log" -mtime -1 -exec cat {} \; 2>/dev/null | tail -20

echo ""
echo "--- Sent Email Count (last 7 days) ---"
# Check sent-emails.json
tail -50 $HOME/.openclaw/workspace/skills/alygn-outreach/src/lib/sent-emails.json | head -20
```

### Alerting

#### Error Alert Script

```bash
#!/bin/bash
# scripts/alert-on-error.sh
ERRORS=$(find $HOME/.openclaw/workspace/skills/alygn-outreach/logs -name "*.error.log" -mtime -1 -exec cat {} \; 2>/dev/null)

if [ -n "$ERRORS" ]; then
  echo "Alygn Outreach Errors Detected:"
  echo "$ERRORS"
  # Send to Discord webhook or email
  curl -H "Content-Type: application/json" \
    -d "{\"content\": \"❌ Alygn Outreach Error:\\n\`\`\`\n$ERRORS\n\`\`\`\"}" \
    https://discord.com/api/webhooks/YOUR_WEBHOOK
fi
```

Add to cron:

```cron
0 10 * * * /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/scripts/alert-on-error.sh
```

### Sent Email Tracking

Sent emails are tracked in:

```
/home/andlersrv/.openclaw/workspace/skills/alygn-outreach/src/lib/sent-emails.json
```

Format:

```json
{
  "lastUpdated": "2026-03-26T15:00:00Z",
  "vcs": [
    {
      "email": "contact@aisafetyvc.com",
      "sentAt": "2026-03-26T15:00:00Z",
      "entityId": "vc-abc123"
    }
  ],
  "municipalities": [
    {
      "email": "info@msj.go.cr",
      "sentAt": "2026-03-26T15:00:00Z",
      "entityId": "municipal-xyz789"
    }
  ]
}
```

The pipeline checks this file at the `personalize` and `send` stages to skip already-contacted entities.

### Dashboard Views

The database includes views for monitoring:

#### `v_pipeline_summary`

Overall pipeline metrics by wave.

```sql
SELECT * FROM v_pipeline_summary;
```

#### `v_wave_status`

Breakdown of municipalities by status within each wave.

```sql
SELECT * FROM v_wave_status WHERE wave_number = 1;
```

---

## Backup and Recovery

### State File Backup

```bash
# Backup state files to persistent storage
cp -r $HOME/.openclaw/workspace/reports/alygn/{subFolderType}/alygn-{type}-{phase}-{date}.json $HOME/.openclaw/workspace/skills/alygn-outreach/backups/

# Cleanup old state files (> 7 days)
find $HOME/.openclaw/workspace/reports/alygn/{subFolderType}/alygn-{type}-{phase}-{date}.json -mtime +7 -delete
```

### Resuming After Failure

The pipeline supports resuming from the last saved state file:

```bash
# Resume validate stage from latest discovered state
bun bin/alygn-outreach.ts --type=vc --action=validate \
  --input=$HOME/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-2026-03-26.json

# Or let it auto-find the latest:
# (omit --input and the pipeline will load the most recent state for that phase)
bun bin/alygn-outreach.ts --type=vc --action=validate --limit=20
```

### Disaster Recovery Checklist

1. **Check last state file:** `ls -lt $HOME/.openclaw/workspace/reports/alygn/{subFolderType}/alygn-{type}-{phase}-{date}.json | head -3`
2. **Check error logs:** `tail $HOME/.openclaw/workspace/skills/alygn-outreach/logs/*.error.log`
3. **Check checkpoint table:** `SELECT * FROM checkpoints ORDER BY updated_at DESC LIMIT 10;`
4. **Resume from appropriate phase:** re-run the cronjob or manual command with `--input`
5. **Verify data integrity:** query the municipalities or VC entities table for consistency
