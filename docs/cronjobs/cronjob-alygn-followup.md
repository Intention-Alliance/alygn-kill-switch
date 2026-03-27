# Cronjob: alygn-followup

**Schedule:** 10:00 AM on Tuesdays and Thursdays
**Type:** Follow-up Automation
**Purpose:** Send follow-up emails to VCs/angels who haven't responded to initial outreach

## Execution Flow

### Phase 1: Identify Follow-up Candidates

- Query Notion pipeline for leads with:
  - Status: "Sent"
  - Last contact: 5+ days ago
  - No reply received
  - Max 2 follow-ups sent

### Phase 2: Generate Follow-up Drafts

- Command: bun ~/.openclaw/workspace/skills/alygn-outreach/bin/alygn-outreach.ts --type=followup --action=personalize --input=/tmp/followups/queue-{today}.json --dry-run
- Personalize based on: Original email context, firm/angel background
- Output: /tmp/followups/queue-{today}-drafted.json

### Phase 3: Send to Discord

- Post follow-up drafts to #annotations channel
- Include: Original subject thread, new value proposition
- Request approval with emoji reactions

### Phase 4: Send (if approved)

- Wait for approval (check Notion or Discord)
- Command: bun ~/.openclaw/workspace/skills/alygn-outreach/bin/alygn-outreach.ts --type=followup --action=send --input=/tmp/followups/queue-{today}-approved.json --rate-limit=4
- Update pipeline: Increment follow-up count, update status

## Success Criteria

- [ ] Follow-up candidates identified
- [ ] Drafts generated with context from original email
- [ ] Posted to Discord for approval
- [ ] Sent with updated status tracking

## Error Handling

- If no candidates: Log "No follow-ups needed", skip run
- If generation fails: Mark for manual follow-up
- If send fails: Retry with backoff, max 3 attempts

## Reporting

- Send summary to Discord #updates
- Include: count sent, previous contact date range, any replies expected
- Note: Follow-ups are every 5-7 days, max 3 total attempts
