# Troubleshooting Guide

> Solutions to common problems with the alygn-outreach skill.

---

## Quick Diagnostic

Run this to get a fast overview of what's broken:

```bash
# 1. Check CLI works
bun bin/alygn-outreach.ts --help

# 2. Check recent state files
ls -lt /tmp/alygn-*.json | head -5

# 3. Check error logs
find /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/logs -name "*.error.log" -mtime 0 -exec echo "=== {} ===" \; -exec tail -20 {} \;

# 4. Check running processes
ps aux | grep alygn-outreach | grep -v grep
```

---

## Common Errors

### "Error: Not implemented" from DiscoveryStrategy

**Cause:** You called `discover()` on the base class instead of a subclass.

**Fix:** The `Pipeline` should automatically use the correct type-specific strategy (`VCDiscoveryStrategy` or `MunicipalDiscoveryStrategy`). If you're seeing this:
1. Check that your entity `type` is correctly set (`'vc'` or `'municipal'`)
2. Verify the strategy is registered in `Pipeline.initializeStrategies()`

```bash
# Verify which strategy is being used
bun bin/alygn-outreach.ts --type=vc --action=discover --limit=1 --dry-run 2>&1 | head -20
```

---

### "No entities found" during validate/research/personalize

**Cause:** The pipeline couldn't load entities from a state file or input.

**Fix:** Run discovery first to create a state file, then pass it explicitly:

```bash
# Step 1: Discover (creates state file)
bun bin/alygn-outreach.ts --type=vc --action=discover --limit=5 --dry-run

# Step 2: Validate with explicit input
bun bin/alygn-outreach.ts --type=vc --action=validate --limit=5 --dry-run

# Or find the auto-generated state file path
ls -lt /tmp/alygn-vc-discovered-*.json | head -1
```

**Also check:** The pipeline auto-loads the latest state file for each phase. If you're running stages out of order, it will fall back to an older state. Always run stages in order: discover → validate → research → personalize → send.

---

### "No entities remaining after duplicate filter"

**Cause:** All entities in your input have already been sent (they're in `sent-emails.json`).

**Fix:**
1. Check `src/lib/sent-emails.json` to see what's there
2. If testing, use `--dry-run` which should skip this check (or clear the sent file temporarily)
3. If re-targeting the same entities, remove them from `sent-emails.json`

```bash
# View sent emails
cat /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/src/lib/sent-emails.json | jq '.vcs | length'
```

---

### "Only VCs with IDs in send list will be processed" — but IDs don't match

**Cause:** The entity IDs from Notion don't match what's in your state file or the pipeline loaded different entities.

**Fix:** Always use IDs from the exact run that generated the drafts. The two-filter system requires:
1. `--draft-status=Approved` — entity must have this status in Notion
2. `--email-send-to=id1,id2` — entity ID must be in this list

```bash
# Get the actual entity IDs from the state file
cat /tmp/alygn-vc-personalized-2026-03-26.json | jq '.data.entities[].id'

# Use those exact IDs in the send command
bun bin/alygn-outreach.ts --type=vc --action=send \
  --draft-status=Approved \
  --email-send-to=<id-from-above> \
  --dry-run
```

---

### "TypeScript import errors" / "Cannot find module"

**Cause:** Missing `.js` extension in imports. TypeScript/ESM requires explicit `.js` extensions.

**Fix:** All imports must use `.js` extension:
```typescript
// Wrong:
import { Pipeline } from './Pipeline';

// Correct:
import { Pipeline } from './Pipeline.js';
```

If you see this error, there's likely a `.bak` file (backup) that was incorrectly edited, or a new file was added without the extension. Check the import in the failing file.

---

### "Supabase types not found" / "Database, Tables not defined"

**Cause:** `src/entities/types.ts` has placeholder aliases for Supabase-generated types. If code tries to use `Tables<'municipalities'>` as a real type, it will fail.

**Fix:** The skill uses inline placeholder types:

```typescript
// In src/entities/types.ts, these are defined as aliases to keep the skill self-contained:
// type MunicipalityRow = Tables<'municipalities'>;  // this is a TYPE ALIAS, not a real import
```

If you need actual Supabase-generated types from the schema:

```bash
cd /home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/supabase
supabase gen types typescript > /home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/supabase/src/database.types.ts
```

Then update the imports in `src/entities/types.ts` to reference the generated file instead of the placeholders.

---

### "ZeroBounce API key invalid" / "Validation failed"

**Cause:** Invalid or missing `ZEROBOUNCE_API_KEY` environment variable.

**Fix:**
```bash
# Check if the env var is set
echo $ZEROBOUNCE_API_KEY

# Set it
export ZEROBOUNCE_API_KEY="your-key-here"

# Test with dry run (skips actual validation calls)
bun bin/alygn-outreach.ts --type=vc --action=validate --limit=5 --dry-run
```

---

### SMTP authentication failed / Email not sending

**Cause:** Wrong SMTP credentials or 2FA without an app password.

**Fix for Gmail:**
1. Enable 2-Factor Authentication on your Google account
2. Generate an **App Password**: Google Account → Security → App passwords
3. Use the app password as `SMTP_PASS` (not your regular password)

```bash
export SMTP_SERVER=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=your@gmail.com
export SMTP_PASS=xxxx xxxx xxxx xxxx  # App password with spaces
```

**Test SMTP:**
```bash
# Quick SMTP test with telnet
telnet smtp.gmail.com 587
# Then type:
# EHLO localhost
# AUTH LOGIN
```

---

### Cronjob Runs but Nothing Happens

**Cause:** Usually a working directory issue — cron uses a minimal `$PATH` and `$HOME`.

**Fix:** Always use absolute paths in cronjobs and `cd` to the skill directory first:

```cron
# Wrong (relative path, wrong cwd):
0 9 * * * bun bin/alygn-outreach.ts --type=vc --action=discover

# Correct (absolute paths, explicit cd):
0 9 * * * cd /home/andlersrv/.openclaw/workspace/skills/alygn-outreach && /usr/bin/bun bin/alygn-outreach.ts --type=vc --action=discover >> /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/logs/vc-discover.log 2>&1
```

Also verify the `.env` file is being loaded. Cronjobs don't load your shell's environment. Use `EnvironmentFile=` in systemd, or export vars at the top of wrapper scripts.

---

### Pipeline Gets Stuck / Hangs

**Cause:** Usually a network call (Grok/x.ai research, email validation API) timing out.

**Fix:**
1. Check for zombie processes: `ps aux | grep bun`
2. Kill stuck processes: `pkill -f alygn-outreach`
3. Add a timeout to API calls (if you're modifying strategy code)
4. Use `--limit=1` to isolate which entity causes the hang

```bash
# Test with single entity to isolate
bun bin/alygn-outreach.ts --type=vc --action=research --limit=1 --input=/tmp/alygn-vc-discovered-2026-03-26.json
```

---

### Wave Tracking Not Working (Municipal)

**Cause:** The wave tracking columns (`wave_number`, `batch_status`, `wave_date`) may not exist in the database.

**Fix:** Run the wave tracking migration:

```bash
cd /home/andlersrv/.openclaw/workspace/scripts/alygn/muni-outreach/supabase
supabase db push
```

Or apply manually:
```sql
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS wave_number INTEGER DEFAULT 1;
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS batch_status TEXT DEFAULT 'researched';
ALTER TABLE municipalities ADD COLUMN IF NOT EXISTS wave_date DATE;
```

---

## Where to Find Logs

| Log | Path |
|-----|------|
| Cronjob stdout | `logs/vc-discover.log`, `logs/muni-send.log`, etc. |
| Cronjob stderr | `logs/vc-discover.error.log`, `logs/muni-send.error.log` |
| Wave-specific logs | `logs/research-wave-YYYY-MM-DD.log` |
| Bun runtime errors | Systemd journal: `journalctl -u alygn-outreach-vc -f` |
| Sent email tracker | `src/lib/sent-emails.json` |
| Pipeline state files | `/tmp/alygn-{type}-{phase}-{date}.json` |

---

## Recovery Procedures

### Recovery 1: Resume a Failed Pipeline Stage

```bash
# Find the last good state file
ls -lt /tmp/alygn-vc-discovered-*.json | head -3

# Resume from that state
bun bin/alygn-outreach.ts --type=vc --action=validate \
  --input=/tmp/alygn-vc-discovered-2026-03-26.json \
  --limit=20
```

### Recovery 2: Reset Wave Tracking

If wave tracking gets out of sync:

```sql
-- Reset all batch statuses to 'researched' for wave 1
UPDATE municipalities
SET batch_status = 'researched', wave_date = NULL
WHERE wave_number = 1 AND batch_status != 'sent';

-- Or reset specific municipality
UPDATE municipalities
SET batch_status = 'researched'
WHERE id = 'your-uuid-here';
```

### Recovery 3: Clear Sent Email Tracker (to re-send)

**Warning:** This allows re-sending to entities that already received emails.

```bash
# Backup first
cp /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/src/lib/sent-emails.json \
  /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/backups/sent-emails-$(date +%Y%m%d).json

# Clear it
echo '{"lastUpdated":"'$(date -I)'","vcs":[],"municipalities":[]}' > \
  /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/src/lib/sent-emails.json
```

### Recovery 4: Restart Cronjob Mid-Wave

If a cronjob was interrupted mid-wave, use the checkpoints table to pick up where it left off:

```sql
-- Check checkpoint status
SELECT * FROM checkpoints
WHERE wave_number = 1
ORDER BY cronjob_name;

-- Reset the stuck checkpoint
UPDATE checkpoints
SET status = 'pending', last_processed_id = NULL, processed_count = 0
WHERE wave_number = 1 AND cronjob_name = 'research-wave' AND status = 'running';
```

Then re-run the cronjob. The strategy should resume from the last processed entity.

### Recovery 5: Fix Corrupt State File

If a state JSON is malformed:

```bash
# Check the file
cat /tmp/alygn-vc-discovered-2026-03-26.json | jq . > /dev/null
# If this prints "parse error", the file is corrupt

# Restore from backup (if available)
cp /home/andlersrv/.openclaw/workspace/skills/alygn-outreach/backups/alygn-vc-discovered-2026-03-26.json \
  /tmp/alygn-vc-discovered-2026-03-26.json

# Or re-run discovery to generate fresh state
bun bin/alygn-outreach.ts --type=vc --action=discover --limit=20 --dry-run
```

---

## Debug Mode

For verbose output during development:

```bash
# Bun's built-in debugger
bun --inspect bin/alygn-outreach.ts --type=vc --action=discover --limit=1

# Or add debug logging to your strategy
console.log('[DEBUG] Processing entity:', entity.name, entity.id);
```

To add conditional debug logging in strategy code:

```typescript
if (process.env.DEBUG === '1' || process.env.NODE_ENV !== 'production') {
  console.log('[DEBUG] Discovery result:', entities.length, 'entities');
}
```

---

## Getting Help

If you've hit an error not covered here:

1. Check the **implementation summary**: `cat IMPLEMENTATION-SUMMARY.md`
2. Check the **skill design**: `cat SKILL-DESIGN.md`
3. Run a **dry-run** to isolate whether the issue is with live sending or the logic
4. Check the **state file** for what data the pipeline is actually working with
