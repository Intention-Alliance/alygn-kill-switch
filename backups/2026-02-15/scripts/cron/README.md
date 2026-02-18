# Cron Job Management

**Current Status:** 18 jobs (needs consolidation)  
**Target:** 9 jobs (clean configuration)

---

## Quick Start

### Reset All Cron Jobs (Recommended)

```bash
cd ~/.openclaw/workspace
bash scripts/cron/cleanup-and-recreate.sh
```

This will:

1. Delete ALL existing cron jobs (18 current)
2. Recreate from clean configuration (9 consolidated)
3. Integrate Twitter Discovery System
4. Switch to Discord notifications

---

## Job Structure (After Reset)

### System Jobs (3)

| Time    | Job                | Description                        |
| ------- | ------------------ | ---------------------------------- |
| 2:00 AM | Backup & Archive   | Daily workspace backup             |
| 8:00 AM | Morning Briefing   | Multi-org audio summary (WhatsApp) |
| 9:00 PM | End-of-Day Summary | GitHub + Twitter + logs (WhatsApp) |

### ALYGN Jobs (4)

| Time         | Job                           | Description                   |
| ------------ | ----------------------------- | ----------------------------- |
| 3:30 AM      | Daily Tracker                 | Project metrics + Notion sync |
| 11:00 AM     | **Twitter Master Automation** | Content + Discovery (Discord) |
| Mon 10:30 AM | VC Contact Discovery          | Weekly VC database update     |
| Mon 11:00 AM | VC Outreach                   | Weekly email campaigns        |

### BitcashOrg Jobs (1)

| Time    | Job           | Description                   |
| ------- | ------------- | ----------------------------- |
| 3:45 AM | Daily Tracker | Project metrics + Notion sync |

### AndlerRL Jobs (1)

| Time    | Job           | Description              |
| ------- | ------------- | ------------------------ |
| 4:00 AM | Daily Tracker | Personal project metrics |

---

## Twitter Master Automation (New!)

**What Changed:**

- ✅ Integrated Discovery System
- ✅ Discord notifications (not WhatsApp)
- ✅ Consolidated 5 separate jobs into 1

**Workflow:**

1. **Content Generation** → Grok generates 5 posts/threads
2. **Discovery System** → Search + evaluate + engage
   - Browse /explore or search "AGI alignment"
   - Grok evaluation: "Should we engage?"
   - X API execution: quotes, replies
3. **Browser Posting** → Post everything via alygn profile
4. **Discord Report** → Summary to #annotations thread

**Output:** 5 original posts + 2-5 reactive engagements = 7-10 total/day

**Discord Thread:**

- Channel: #annotations (`1466532145257255004`)
- Thread: "Alygn: X/Twitter Growth Engagement" (`1470977688368840928`)

---

## Removed Jobs (9 eliminated)

**Old Twitter Jobs (removed):**

- Daily Thread Ideas (9 AM) - merged into Master
- Trend Monitoring (every 6h) - merged into Master
- Strategic Replies (10 AM) - merged into Master
- Weekly Review (Sun 5 PM) - redundant
- Monthly Review (1st 10 AM) - redundant

**Other Removed:**

- Multiple Notion sync checks (redundant)
- Project health monitors (covered by trackers)
- Jacobo daily summary (obsolete)

---

## Management Commands

### List All Jobs

```bash
openclaw cron list
```

### List JSON Format

```bash
openclaw cron list --json | jq '.jobs[] | {name, schedule: .schedule.expr}'
```

### Check Specific Job

```bash
openclaw cron list --json | jq '.jobs[] | select(.name | contains("Twitter"))'
```

### View Job Runs

```bash
openclaw cron runs <job-id>
```

### Delete Single Job

```bash
openclaw cron remove <job-id>
```

### Delete All Jobs

```bash
for JOB_ID in $(openclaw cron list --json | jq -r '.jobs[].id'); do
  openclaw cron remove "$JOB_ID"
done
```

---

## Files

```
scripts/cron/
├── README.md                    # This file
├── cleanup-and-recreate.sh      # Reset all jobs ← USE THIS
├── create-all-crons.sh         # Old version (18 jobs)
└── verify-crons.sh             # Verify job status
```

---

## Troubleshooting

### Gateway Timeout on Update

```bash
openclaw gateway restart
# Wait 5 seconds
bash scripts/cron/cleanup-and-recreate.sh
```

### Jobs Not Running

```bash
# Check job status
openclaw cron list --json | jq '.jobs[] | {name, enabled, nextRun: .state.nextRunAtMs}'

# Check last run
openclaw cron runs <job-id>
```

### Discord Thread Not Receiving Messages

```bash
# Test Discord delivery
message --action=send --channel=discord --target=1470977688368840928 --message="Test"

# If fails, check Discord bot status
openclaw status
```

---

## Migration Notes

**Before Reset:**

- 18 total jobs
- 5 separate Twitter jobs (redundant)
- WhatsApp notifications for automation
- Complex overlap between jobs

**After Reset:**

- 9 total jobs (50% reduction)
- 1 consolidated Twitter job
- Discord notifications for Twitter automation
- Clean separation of concerns

**Breaking Changes:**

- Twitter jobs now run at 11 AM (not spread throughout day)
- Discord thread for automation reports (not WhatsApp)
- Discovery System integrated (new feature)

---

## Next Steps

1. **Run cleanup script:**

   ```bash
   bash scripts/cron/cleanup-and-recreate.sh
   ```

2. **Verify jobs created:**

   ```bash
   openclaw cron list | head -15
   ```

3. **Wait for first run:**
   - Tomorrow 11 AM: Twitter Master Automation
   - Check Discord #annotations thread for results

4. **Monitor performance:**
   - Track job runs: `openclaw cron runs <job-id>`
   - Review Discord reports
   - Adjust timing/frequency as needed

---

**Last Updated:** Feb 11, 2026  
**Maintained By:** Wobblus
