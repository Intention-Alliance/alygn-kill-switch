# Municipal Outreach Campaign Workflow - Morning (Send)

Run municipal outreach via Lobster below:

```yaml
name: alygn-campaign
description: Costa Rica municipal outreach pilot (82 cantones) campaign with personalization - using alygn-outreach skill
metadata:
  project: alygn
  type: muni-outreach
  wave: 1
  script: `cd $HOME/.openclaw/workspace && lobster run .lobster/alygn-muni-outreach.lobster`
```

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

**Time:** 10:00 AM daily (Mon-Fri)
**Purpose:** Generate and send municipal outreach emails for today's wave
**Discord Thread:** 1486784946134712500

## Execution

This cronjob runs the `personalize` and `send` phases for approved drafts.

## Test Mode

Add `--dry-run` flag for testing without sending emails.
