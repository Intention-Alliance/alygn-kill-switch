# Municipal Outreach Afternoon Retry Cronjob

**Schedule:** `0 15 * * 1-5` (3:00 PM CST, Monday-Friday)  
**Timezone:** America/Costa_Rica  
**Timeout:** 1800 seconds (30 minutes)  
**Discord Thread:** 1486784946134712500

---

## Purpose

Retry failed municipal email sends from the morning run. This cronjob:

1. Loads the latest wave state file
2. Identifies entities with `status=failed` or `sendError`
3. Re-attempts send for failed entities only
4. Updates Supabase and wave state on success
5. Posts summary to Discord

---

## Command

```bash
cd $HOME/.agents/skills/alygn-outreach && \
./scripts/preflight-check.sh municipal && \
bun bin/alygn-outreach.ts \
  --type=municipal \
  --action=send \
  --retry-failed \
  --draft-status=Approved \
  --limit=50 \
  --dry-run
```

**Note:** Remove `--dry-run` for production sends.

---

## Pre-flight Checks

The `preflight-check.sh` script verifies:

1. **Wave state file exists** - Latest file in `reports/alygn/muni-waves/`
2. **Supabase credentials** - Present in `config/credentials.json`
3. **SMTP credentials** - Present and valid
4. **Bun runtime** - Available in PATH
5. **Dependencies** - `node_modules/` installed
6. **Build output** - `dist/` directory exists
7. **Log directory** - `reports/alygn/logs/` writable

If any check fails, the cronjob exits with a clear error message.

---

## Expected Output

### Success (entities sent)

```
🔍 Alygn Outreach Pre-flight Check
   Type: municipal
   Time: Mon Mar 30 15:00:00 CST 2026

✓ Checking wave state files...
   Latest wave: /home/andlersrv/.openclaw/workspace/reports/alygn/muni-waves/alygn-municipal-sent-2026-03-30.json
   Wave age: 6 hours (OK)
✓ Checking credentials...
   Supabase: OK
   SMTP: OK
✓ Checking runtime...
   Bun: 1.2.3
✓ Checking dependencies...
   Dependencies: OK
✓ Checking build...
   Build: OK
✓ Checking logs...
   Logs: OK

✅ Pre-flight checks passed

🎯 Alygn Outreach CLI (TypeScript)

🚀 Running MUNICIPAL pipeline: send
   Dry run: YES
   Limit: 50
   Retry failed: YES

🔄 Retrying 2 failed entities
   ✓ Sent to: San José (alcalde@sj.go.cr)
   ✓ Sent to: Alajuela (info@alajuela.go.cr)

============================================================
📊 Results
============================================================
   Sent: 2
   Failed: 0
   State: /home/andlersrv/.openclaw/workspace/reports/alygn/muni-sent/alygn-municipal-sent-2026-03-30.json
============================================================

📬 [alygn-muni-afternoon] — Retry Complete
• Sent: 2
• Failed: 0
• Exhausted: 0
```

### Success (no failures to retry)

```
✅ Pre-flight checks passed

🎯 Alygn Outreach CLI (TypeScript)

🚀 Running MUNICIPAL pipeline: send
   Retry failed: YES
ℹ️  No failed entities to retry

============================================================
📊 Results
============================================================
   Sent: 0
   Skipped: true
   Reason: No failures
============================================================

ℹ️  [alygn-muni-afternoon] No retries needed today
```

---

## Error Handling

### Single Entity Failure

- Does NOT halt the entire run
- Logs error to `reports/alygn/logs/send-errors-YYYY-MM-DD.json`
- Continues processing remaining entities
- Increments `retry_count` on entity

### Draft Status Mismatch

If entity shows "Not drafted !== Approved":

- Entity was not properly approved in previous stage
- Skip entity, do NOT retry
- Log to error file for manual review

### Supabase Update Failure

- Retry update 3 times with exponential backoff
- If all retries fail, log error and continue
- Mark entity as `pending_supabase_update`

### Exhausted Entities (3+ failures)

- Marked as `exhausted` in wave file
- Skipped on subsequent retry attempts
- Requires manual review

---

## Wave State File Format

```json
{
  "timestamp": "2026-03-30T09:00:00.000Z",
  "type": "municipal",
  "phase": "sent",
  "data": {
    "entities": [
      {
        "id": "muni-001",
        "type": "municipal",
        "name": "San José",
        "province": "San José",
        "mayor_name": "Johnny Araya",
        "mayor_email": "alcalde@sj.go.cr",
        "outreach": {
          "status": "failed",
          "sendError": "SMTP rejection: mailbox full",
          "retryCount": 1,
          "lastAttempt": "2026-03-30T15:05:00.000Z",
          "draftStatus": "Approved"
        }
      }
    ]
  }
}
```

---

## Data Store Updates

On successful send, update:

1. **Supabase** (`municipalities` table):

   ```sql
   UPDATE municipalities
   SET outreach_sent_at = NOW(),
       outreach_status = 'sent'
   WHERE mayor_email = 'alcalde@sj.go.cr';
   ```

2. **Wave state file**:

   ```json
   {
     "outreach": {
       "status": "sent",
       "sentAt": "2026-03-30T15:05:00.000Z",
       "messageId": "<msg-id@alyyygn.gmail.com>"
     }
   }
   ```

3. **Local backup** (`data/sent-emails.json`):

   ```json
   {
     "email": "alcalde@sj.go.cr",
     "type": "municipal",
     "sentAt": "2026-03-30T15:05:00.000Z",
     "entityName": "San José"
   }
   ```

---

## Lobster Integration

```yaml
name: alygn-muni-afternoon-retry
description: Municipal outreach afternoon retry for failed sends
metadata:
  project: alygn
  type: muni-outreach
  schedule: "0 15 * * 1-5"
  timezone: America/Costa_Rica
  timeout: 1800

execution:
  preFlight: "./scripts/preflight-check.sh municipal"
  command: |
    bun bin/alygn-outreach.ts \
      --type=municipal \
      --action=send \
      --retry-failed \
      --draft-status=Approved \
      --limit=50

delivery:
  channel: discord
  thread: "1486784946134712500"
  bestEffort: true
```

---

## Testing

### Dry-run test

```bash
cd $HOME/.agents/skills/alygn-outreach
./scripts/preflight-check.sh municipal && \
bun bin/alygn-outreach.ts \
  --type=municipal \
  --action=send \
  --retry-failed \
  --dry-run \
  --limit=5
```

### Verify Supabase connection

```bash
# Check credentials file
cat $HOME/.openclaw/workspace/config/credentials.json | jq '.supabase'
```

---

## Troubleshooting

| Symptom                        | Likely Cause                   | Fix                                  |
| ------------------------------ | ------------------------------ | ------------------------------------ |
| "No wave state found"          | First run or wave file deleted | Run morning discovery first          |
| "Supabase credentials missing" | Credentials file corrupted     | Re-run credential setup              |
| "Draft status mismatch"        | Entity not approved            | Check approval workflow              |
| Timeout after 5 min            | Old cronjob spec               | Update timeout to 1800s              |
| "Bun not found"                | Bun not in PATH                | `export PATH="$HOME/.bun/bin:$PATH"` |

---

## Change Log

| Date       | Change                              |
| ---------- | ----------------------------------- |
| 2026-03-30 | Added `--retry-failed` flag support |
| 2026-03-30 | Added pre-flight check script       |
| 2026-03-30 | Increased timeout to 1800s          |
| 2026-03-30 | Fixed wave state file path          |
| 2026-03-30 | Added Supabase update verification  |
