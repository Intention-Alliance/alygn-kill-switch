# Cronjob: alygn-angel-morning

**Schedule:** 9:00 AM daily (Mon-Fri)
**Type:** Angel Investor Outreach
**Purpose:** Generate and send angel investor outreach emails for today's wave

## Execution Flow

### Phase 1: Load Wave

- Read: `$HOME/.openclaw/workspace/reports/alygn/ai-waves/wave-{today}-angel.json`
- Status must be: "researched" or "drafted"

### Phase 2: Generate Drafts

- Command: `USE_DIRECT_API=true bun ~/.openclaw/workspace/skills/alygn-outreach/bin/alygn-outreach.ts --type=angel --action=personalize --input=$HOME/.openclaw/workspace/reports/alygn/ai-waves/wave-{today}-angel.json --output=$HOME/.openclaw/workspace/reports/alygn/ai-waves/wave-{today}-angel-drafted.json`
- Output: `$HOME/.openclaw/workspace/reports/alygn/ai-waves/wave-{today}-angel-drafted.json`

### Phase 3: Send to Discord

- Post draft emails to #annotations channel
- Include: Subject, body preview, investor name
- Request approval with emoji reactions

### Phase 4: Send (if approved)

- Wait for approval (check Notion or Discord)
- Command: `bun ~/.openclaw/workspace/skills/alygn-outreach/bin/alygn-outreach.ts --type=angel --action=send --input=$HOME/.openclaw/workspace/reports/alygn/ai-waves/wave-{today}-angel-approved.json --cc=<tanialeaidm@gmail.com> --rate-limit=5`
- Update status to "sent"

## Success Criteria

- [ ] Emails generated with personalization
- [ ] Posted to Discord for approval
- [ ] Sent with CC to Tania
- [ ] Status updated in wave file

## Error Handling

- If no wave file: Log error, skip run
- If generation fails: Mark as failed, continue
- If send fails: Retry with backoff, max 3 attempts

## Reporting

- Send summary to Discord #updates
- Include: count sent, count failed, any issues
