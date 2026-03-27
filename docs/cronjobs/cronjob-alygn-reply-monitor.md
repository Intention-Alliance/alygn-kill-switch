# Cronjob: alygn-reply-monitor

**Schedule:** Every 2 hours (9 AM - 9 PM daily)
**Type:** Reply Tracking
**Purpose:** Monitor email replies and track VC/angel responses in the pipeline

## Execution Flow

### Phase 1: Check Gmail

- Command: bun ~/.openclaw/workspace/skills/alygn-outreach/bin/alygn-outreach.ts --action=check-replies --since={last_check}
- Scan: alygn@andler.dev inbox for new replies
- Filter: Replies to outbound outreach emails only

### Phase 2: Categorize Replies

- Command: bun ~/.openclaw/workspace/skills/alygn-outreach/bin/alygn-outreach.ts --action=categorize --input=/tmp/replies/raw-{timestamp}.json
- Categories: interested, not_now, pass, meeting_request, needs_followup

### Phase 3: Update Pipeline

- Update Notion pipeline with reply status
- Move interested leads to "Responded - Interested"
- Flag meeting requests for immediate attention
- Log passes with reason (if provided)

### Phase 4: Trigger Actions

- Interested → Schedule follow-up task
- Meeting request → Create calendar hold + notify Tania
- Needs_followup → Add to priority queue

## Success Criteria

- [ ] Gmail inbox scanned successfully
- [ ] Replies categorized accurately
- [ ] Pipeline updated in Notion
- [ ] Actions triggered for hot leads

## Error Handling

- If Gmail API fails: Retry in 30 minutes
- If categorization unclear: Flag for manual review
- If Notion update fails: Queue for retry, log locally

## Reporting

- Post reply summary to Discord #updates
- Include: new replies, interested count, meetings requested
- Flag urgent items requiring immediate attention
