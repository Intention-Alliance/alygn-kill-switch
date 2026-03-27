# VC Outreach Campaign Workflow - Morning (Send)

Run VC outreach via Lobster below:

```yaml
name: alygn-campaign
description: Alygn VC outreach campaign with personalization - using alygn-outreach skill
metadata:
  project: alygn
  type: vc-outreach
  wave: 1
  script: `cd $HOME/.openclaw/workspace && lobster run .lobster/alygn-vc-outreach.lobster`
```

## Important:
- Revise the researched VC if email is already sent.
  - Only research VCs that hasn't been contacted yet.
- Follow each step as it is. **No shortcuts allowed**.
- First read the instructions before running the lobster file.
- Run lobster first. If fails, read the lobster file and follow the steps instructions.
- Avoid updating code and finding your own solutions. Stop and report.
- You are reaching out VCs, ensure to do all validations as described before email send.
- Provide a snippet of the email draft personalization, so as the VC partner name and the draft id to quickly identify which to approve/reject.
- Once a Draft is approved by chat, ensure updating database references (Notion).
  - Verifying database schema is a must if required to.

## Schedule
**Time:** 9:00 AM daily (Mon-Fri)
**Purpose:** Generate and send VC outreach emails for today's wave
**Discord Thread:** 1486784711928975460

## Execution
This cronjob runs the `personalize` and `send` phases for approved drafts.

## Test Mode
Add `--dry-run` flag for testing without sending emails.
