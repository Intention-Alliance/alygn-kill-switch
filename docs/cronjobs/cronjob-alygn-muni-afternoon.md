# Municipal Outreach Campaign Workflow - Afternoon (Recovery)

Run municipal outreach via Lobster below:

```yaml
name: alygn-campaign
description: Costa Rica municipal outreach pilot (82 cantones) campaign with personalization - using alygn-outreach skill
metadata:
  project: alygn
  type: muni-outreach
  wave: [latest-wave-number] + 1
  script: `cd $HOME/.openclaw/workspace && lobster run .lobster/alygn-muni-outreach.lobster`
```

## Execution

This cronjob handles bounced emails, retries failed sends, and researches alternative contacts.

### 1. Load Today's Wave File

- Wave files stored in `$HOME/.openclaw/workspace/reports/alygn/waves/MUNI/YYYY-MM-DD.json`
- Identify all entities with status `drafted` (approved and ready to send) and `failed` (needs retry)

### 2. Process Approved Sends

- For each entity with status `drafted`:
  - Execute **Phase 6 (Send)** via the `alygn-muni-outreach` skill
  - Send the approved email to the municipal contact
  - Mark entity status as `sent` in the wave file upon confirmed delivery
  - Log send timestamp

### 3. Handle Failures and Rejections

- Scan the wave file for entities marked `failed` from the morning run or previous attempts
- For entities with status `failed`:
  - Attempt retry personalization (Phase 4) with revised context
  - If retry succeeds, mark as `drafted` and queue for send
  - If retry fails again, increment `retry_count` and log
  - Entities that have failed 3+ times: mark as `exhausted` and move to dead-letter queue

### 4. Post Status to Discord

```txt
📬 [alygn-muni-afternoon] — Today's Municipal Wave Status
- Sent: X
- Pending: Y
- Failed (retrying): Z
- Exhausted: W
```

### 5. Update Tracker

- Log all sends to `$HOME/.openclaw/workspace/reports/alygn/waves/MUNI/logs/sent-email-tracker.json`
- Include: entity id, municipality name, department, send timestamp, status

## Phases

- `phase6-send` — Send the approved email to the municipal contact
- `phase4-personalize` — Re-personalize for retry attempts

## Expected Outcomes

- All `drafted` entities from today's municipal wave have been sent
- `failed` entities have been retried at least once
- Discord receives a clear status summary

## On Success

- Wave file updated: `drafted` → `sent`, `failed` → `sent` (on retry success)
- SentEmailTracker updated with all new sends
- Post to Discord: `✅ [alygn-muni-afternoon] Complete — X emails sent, Y retried`

## On Failure

- If Phase 6 (send) fails for an entity: mark as `failed`, increment retry_count, log to error-log.json
- If an entity has reached `exhausted` status: do NOT retry further, log and skip
- If Discord is unreachable: log to error-log.json and retry on next run
- Do NOT let a single failure halt the entire run — process all entities

## Notes

- Municipal contacts may have specific email format requirements (e.g., city.gov domains) — verify deliverability before sending
- Some municipalities use public records requests for contact info — ensure compliance with any applicable laws
- Only send emails that have explicit approval (via Discord reaction/thread or config flag)
- If no entities are ready to send, post `ℹ️ [alygn-muni-afternoon] No sends due today` and exit cleanly

## Important

- Revise the researched municipalities if email is already sent.
  - Only research municipalities that hasn't been contacted yet.
- Follow each step as it is. **No shortcuts allowed**.
- First read the instructions before running the lobster file.
- Run lobster first. If fails, read the lobster file and follow the steps instructions.
- Avoid updating code and finding your own solutions. Stop and report.
- You are reaching out municipalities, ensure to do all validations as described before email send.
- Provide a snippet of the email draft personalization, so as the Mayor/Politician Figure name and the draft id to quickly identify which to approve/reject.
- Once a Draft is approved by chat, ensure updating database references (Supabase).
  - Verifying database schema is a must if required to.

## Schedule

**Time:** 3:00 PM daily (Mon-Fri)
**Purpose:** Handle failures and retry from morning sends
**Discord Thread:** 1486784946134712500

## Test Mode

Add `--dry-run` flag for testing without sending emails.
