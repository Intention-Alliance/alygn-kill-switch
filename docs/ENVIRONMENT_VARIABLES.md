# Environment Variables Reference

**Last Updated:** 2026-04-10  
**Purpose:** Required environment variables for Batch 4 frameworks and services

---

## Batch 4: Resilience & Scaling Frameworks

### Business Continuity Planning (Issue #111)

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `SUPABASE_URL` | ✅ Yes | Supabase project URL (e.g., `https://xxxx.supabase.co`) | `backup-3-2-1.sh`, `health-check.sh` |
| `SUPABASE_SERVICE_KEY` | ✅ Yes | Supabase service role key (NOT anon key) | `backup-3-2-1.sh` |
| `SUPABASE_KEY` | ✅ Yes | Supabase API key for health checks | `health-check.sh` |
| `NOTION_TOKEN` | ✅ Yes | Notion integration token | `backup-3-2-1.sh`, `health-check.sh` |
| `AWS_ACCESS_KEY_ID` | ⚠️ Optional | AWS credentials for S3 backups | `backup-3-2-1.sh` |
| `AWS_SECRET_ACCESS_KEY` | ⚠️ Optional | AWS credentials for S3 backups | `backup-3-2-1.sh` |
| `AWS_REGION` | ⚠️ Optional | AWS region (default: `us-east-1`) | `backup-3-2-1.sh` |
| `GCS_KEY_FILE` | ⚠️ Optional | Path to Google Cloud service account JSON | `backup-3-2-1.sh` |
| `DISCORD_WEBHOOK_URL` | ⚠️ Optional | Discord webhook for alerts | `health-check.sh` |
| `SLACK_WEBHOOK_URL` | ⚠️ Optional | Slack webhook for alerts | `health-check.sh` |
| `ALERT_EMAIL` | ⚠️ Optional | Email for critical alerts | `health-check.sh` |

---

### WebSocket Pool (Issue #113)

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `REDIS_URL` | ⚠️ Optional | Redis connection string (default: `redis://localhost:6379`) | `websocket-pool.js` |
| `SERVER_ID` | ⚠️ Optional | Unique server identifier (default: auto-generated) | `websocket-pool.js` |

---

### Rate Limiting (Issue #112)

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `REDIS_URL` | ⚠️ Optional | Redis connection for distributed state | `rate-limiter.cjs` |

---

### Distributed Tracing (Issue #115)

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `OTEL_EXPORTER_JAEGER_ENDPOINT` | ⚠️ Optional | Jaeger collector URL (default: `http://localhost:14268/api/traces`) | `tracing.js` |
| `OTEL_SERVICE_NAME` | ⚠️ Optional | Service name in traces (default: `andler-ops`) | `tracing.js` |
| `OTEL_TRACE_SAMPLER` | ⚠️ Optional | Sampling rate: `always_on`, `always_off`, or `parent_based` | `tracing.js` |

---

### Feature Flags (Issue #116)

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `FEATURE_FLAGS_CONFIG_PATH` | ⚠️ Optional | Path to feature flags JSON (default: `config/feature-flags.json`) | `feature-flags.js` |

---

## Outreach Listener (WebSocket Pool First Feature)

### Email (IMAP) Adapter

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `EMAIL_IMAP_HOST` | ✅ Yes | IMAP server (e.g., `imap.gmail.com`) | `outreach-listener.js` |
| `EMAIL_IMAP_PORT` | ⚠️ Optional | IMAP port (default: `993`) | `outreach-listener.js` |
| `EMAIL_USERNAME` | ✅ Yes | Email address | `outreach-listener.js` |
| `EMAIL_PASSWORD` | ✅ Yes | Email password or app-specific password | `outreach-listener.js` |

### Discord Adapter

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `DISCORD_BOT_TOKEN` | ✅ Yes | Discord bot token | `outreach-listener.js` |
| `DISCORD_GUILD_ID` | ⚠️ Optional | Discord server ID for DMs | `outreach-listener.js` |

### Signal Adapter

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `SIGNAL_CLI_PATH` | ⚠️ Optional | Path to signal-cli binary | `outreach-listener.js` |
| `SIGNAL_PHONE_NUMBER` | ⚠️ Optional | Registered Signal phone number | `outreach-listener.js` |

### Notion Integration

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `NOTION_TOKEN` | ✅ Yes | Notion integration token | `outreach-listener.js` |
| `NOTION_OUTREACH_DB_ID` | ⚠️ Optional | Notion database ID for logging | `outreach-listener.js` |

### Urgent Alerts

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `URGENT_ALERT_PHONE` | ⚠️ Optional | Phone number for urgent Signal/WhatsApp alerts | `outreach-listener.js` |
| `URGENT_ALERT_EMAIL` | ⚠️ Optional | Email for urgent alerts | `outreach-listener.js` |

---

## Chaos Engineering (Issue #117)

| Variable | Required | Description | Used By |
|----------|----------|-------------|---------|
| `CHAOS_SCOPE` | ⚠️ Optional | Allowed scope: `local`, `development`, `staging` (default: `local`) | `chaos-engineering.js` |
| `CHAOS_DRY_RUN` | ⚠️ Optional | Set to `true` to simulate without executing | `chaos-engineering.js` |
| `KUBECONFIG` | ⚠️ Optional | Path to kubeconfig for pod-kill experiments | `chaos-engineering.js` |

---

## Quick Setup Template

Create `.env` file in project root:

```bash
# Supabase (Required for BCP)
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
SUPABASE_KEY=eyJ...

# Notion (Required for BCP and Outreach)
NOTION_TOKEN=secret_...
NOTION_OUTREACH_DB_ID=32c3...

# Email IMAP (Required for Outreach Listener)
EMAIL_IMAP_HOST=imap.gmail.com
EMAIL_IMAP_PORT=993
EMAIL_USERNAME=alyyygn@gmail.com
EMAIL_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Discord (Required for Outreach Listener)
DISCORD_BOT_TOKEN=MTAx...

# Redis (Optional - defaults to localhost)
REDIS_URL=redis://localhost:6379

# Tracing (Optional)
OTEL_EXPORTER_JAEGER_ENDPOINT=http://localhost:14268/api/traces
OTEL_SERVICE_NAME=andler-ops

# Backup Storage (Optional - for cloud backups)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=xxxx
AWS_REGION=us-east-1

# Alerting (Optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
URGENT_ALERT_PHONE=+50662163355
```

---

## Security Notes

1. **Never commit `.env` files** — Add to `.gitignore`
2. **Use service role keys** for Supabase backups (not anon keys)
3. **App-specific passwords** for email (not main password)
4. **Rotate tokens** regularly
5. **Use secrets manager** in production (AWS Secrets Manager, etc.)

---

## Verification

Check required variables are set:

```bash
# BCP
./scripts/system/health-check.sh --check-env

# Outreach Listener
node services/outreach-listener.js --dry-run
```
