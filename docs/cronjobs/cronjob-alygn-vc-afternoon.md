# VC Outreach Afternoon Retry Cronjob

**Schedule:** `0 14 * * 1-5` (2:00 PM CST, Monday-Friday)  
**Timezone:** America/Costa_Rica  
**Timeout:** 1800 seconds (30 minutes)  
**Discord Thread:** 1486784711928975460

---

## Purpose

Retry failed VC email sends from the morning run. This cronjob:
1. Loads the latest wave state file
2. Identifies entities with `status=failed` or `sendError`
3. Re-attempts send for failed entities only
4. Updates Notion and wave state on success
5. Posts summary to Discord

---

## Command

```bash
cd $HOME/.agents/skills/alygn-outreach && \
./scripts/preflight-check.sh vc && \
bun bin/alygn-outreach.ts \
  --type=vc \
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

1. **Wave state file exists** - Latest file in `reports/alygn/vc-waves/`
2. **Notion credentials** - Present in `config/credentials.json`
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
   Type: vc
   Time: Mon Mar 30 14:00:00 CST 2026

✓ Checking wave state files...
   Latest wave: /home/andlersrv/.openclaw/workspace/reports/alygn/vc-waves/alygn-vc-sent-2026-03-30.json
   Wave age: 5 hours (OK)
✓ Checking credentials...
   Notion: OK
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

🚀 Running VC pipeline: send
   Dry run: YES
   Limit: 50
   Retry failed: YES

🔄 Retrying 3 failed entities
   ✓ Sent to: Andreessen Horowitz (andreessen@ahorowitz.com)
   ✓ Sent to: Sequoia Capital (roelof@sequoiacap.com)
   ⚠️  Failed: Benchmark (network timeout)

============================================================
📊 Results
============================================================
   Sent: 2
   Failed: 1
   State: /home/andlersrv/.openclaw/workspace/reports/alygn/vc-sent/alygn-vc-sent-2026-03-30.json
============================================================

📬 [alygn-vc-afternoon] — Retry Complete
• Sent: 2
• Failed: 1 (logged to error file)
• Exhausted: 0
```

### Success (no failures to retry)
```
✅ Pre-flight checks passed

🎯 Alygn Outreach CLI (TypeScript)

🚀 Running VC pipeline: send
   Retry failed: YES
ℹ️  No failed entities to retry

============================================================
📊 Results
============================================================
   Sent: 0
   Skipped: true
   Reason: No failures
============================================================

ℹ️  [alygn-vc-afternoon] No retries needed today
```

### Failure (pre-flight check fails)
```
🔍 Alygn Outreach Pre-flight Check
   Type: vc

✓ Checking wave state files...
   Latest wave: /home/andlersrv/.openclaw/workspace/reports/alygn/vc-waves/alygn-vc-sent-2026-03-28.json
⚠️  Wave file is 52 hours old (may be stale)
❌ Notion credentials missing

⚠️  Pre-flight checks completed with warnings
```

---

## Error Handling

### Single Entity Failure
- Does NOT halt the entire run
- Logs error to `reports/alygn/logs/send-errors-YYYY-MM-DD.json`
- Continues processing remaining entities
- Increments `retry_count` on entity

### Exhausted Entities (3+ failures)
- Marked as `exhausted` in wave file
- Skipped on subsequent retry attempts
- Requires manual review

### Discord Unreachable
- Logs error to `error-log.json`
- Continues processing
- Retries Discord post on next run

---

## Wave State File Format

```json
{
  "timestamp": "2026-03-30T09:00:00.000Z",
  "type": "vc",
  "phase": "sent",
  "data": {
    "entities": [
      {
        "id": "vc-001",
        "type": "vc",
        "name": "Andreessen Horowitz",
        "email": "andreessen@ahorowitz.com",
        "outreach": {
          "status": "failed",
          "sendError": "SMTP timeout",
          "retryCount": 1,
          "lastAttempt": "2026-03-30T14:05:00.000Z"
        }
      }
    ]
  }
}
```

---

## Lobster Integration

```yaml
name: alygn-vc-afternoon-retry
description: VC outreach afternoon retry for failed sends
metadata:
  project: alygn
  type: vc-outreach
  schedule: "0 14 * * 1-5"
  timezone: America/Costa_Rica
  timeout: 1800

execution:
  preFlight: "./scripts/preflight-check.sh vc"
  command: |
    bun bin/alygn-outreach.ts \
      --type=vc \
      --action=send \
      --retry-failed \
      --draft-status=Approved \
      --limit=50

delivery:
  channel: discord
  thread: "1486784711928975460"
  bestEffort: true
```

---

## Testing

### Dry-run test
```bash
cd $HOME/.agents/skills/alygn-outreach
./scripts/preflight-check.sh vc && \
bun bin/alygn-outreach.ts \
  --type=vc \
  --action=send \
  --retry-failed \
  --dry-run \
  --limit=5
```

### Force a retry scenario
```bash
# Manually mark an entity as failed in the wave file
# Then run retry to verify it picks up the failure
```

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| "No wave state found" | First run or wave file deleted | Run morning discovery first |
| "Notion credentials missing" | Credentials file corrupted | Re-run credential setup |
| "Bun not found" | Bun not in PATH | `export PATH="$HOME/.bun/bin:$PATH"` |
| Timeout after 5 min | Old cronjob spec | Update timeout to 1800s |
| "Draft status mismatch" | Entity not approved | Check Notion Draft Status field |

---

## Change Log

| Date | Change |
|------|--------|
| 2026-03-30 | Added `--retry-failed` flag support |
| 2026-03-30 | Added pre-flight check script |
| 2026-03-30 | Increased timeout to 1800s |
| 2026-03-30 | Fixed wave state file path |
