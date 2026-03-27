# send-approved-emails.js - Design & Implementation Guide

## Overview

**Purpose:** Final phase of ALYGN VC outreach workflow - send approved emails with full tracking and governance.

**Scope:**

- Load human-approved email drafts
- Validate recipients and content
- Send via SMTP (or configured service)
- Track in Notion (mark "Sent" status + date + message ID)
- Post summary to Discord

## Architecture

### Phase 5: Sending (This Script)

```
Draft Approval → Load Approved Drafts → Validate → Send → Update Notion → Report
   (Discord)         (files/Notion)       (email)    (SMTP)  (Status/Date)  (Discord)
```

### Design Principles

1. **Human Approval Always Required**
   - Never auto-send without explicit approval
   - Drafts stay in "draft" status until approved
   - Only "approved" status emails are sent

2. **Full Audit Trail**
   - Message ID tracking (who/when/what)
   - Notion records: Status = "Sent", Sent Date, Message ID
   - Discord logging of all sends

3. **Rate Limiting**
   - Avoid hitting ISP/Gmail rate limits
   - Default: 3000ms between sends
   - Configurable per run

4. **Graceful Failure**
   - Individual email failures don't stop batch
   - Track per-VC success/failure
   - Report summary with detailed breakdown

## Usage

### Basic Commands

```bash
# Send next 5 approved emails
node send-approved-emails.js --limit=5

# Send to specific VC
node send-approved-emails.js --vc-name="Khosla"

# Send from specific batch
node send-approved-emails.js --batch-id="batch-20260213-001"

# Preview without actually sending
node send-approved-emails.js --limit=5 --dry-run

# Retry failed sends
node send-approved-emails.js --resend-failed

# Custom rate limit (500ms between sends)
node send-approved-emails.js --limit=10 --rate-limit=500
```

### Common Workflows

**Workflow 1: Send Single VC**

```bash
node send-approved-emails.js --vc-name="Khosla" --dry-run   # Preview first
node send-approved-emails.js --vc-name="Khosla"             # Actually send
```

**Workflow 2: Send Batch of 5**

```bash
node send-approved-emails.js --limit=5 --dry-run            # Preview
node send-approved-emails.js --limit=5                      # Send (with 3s delay between)
```

**Workflow 3: Retry Failed Sends**

```bash
node send-approved-emails.js --resend-failed --limit=5      # Retry up to 5 failures
```

## Key Design Decisions

### 1. Draft Approval Flow

**Before Sending:**

```
draft-{pageId}.json created by draft-outreach-emails.js
  └─ status: "draft"
  └─ Posted to Discord #annotations for approval
```

**Approval Process:**

- Andler reviews draft in Discord #annotations
- Approves or edits via commands:
  - `APPROVE [VC]` → updates status to "approved"
  - `EDIT [VC]: [changes]` → updates content + status
  - `SKIP [VC]` → marks status "skipped"

**During Sending:**

- Script loads only "approved" status drafts
- Validates recipient email + content
- Sends via SMTP
- Updates Notion: Status="Sent", Sent Date, Message ID

### 2. Email Delivery

**Current Status:** MVP with logging (no actual SMTP yet)

- Script validates email format
- Logs what would be sent
- Returns mock message ID
- Ready for SMTP implementation

**TODO: Production Implementation**

```javascript
// Use nodemailer for SMTP sending
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: { user: FROM_EMAIL, pass: PASSWORD },
});

await transporter.sendMail({
  from: FROM_EMAIL,
  to: recipient,
  subject: subject,
  html: htmlBody,
  headers: {
    "X-Message-ID": messageId,
    "X-VC-Name": vcName,
  },
});
```

### 3. Notion Tracking

**Before Send:**

```
Status: "Ready for outreach"
Sent Date: (empty)
Notes: [Summary + Conversation Logs]
```

**After Send:**

```
Status: "Sent" ✅
Sent Date: 2026-02-13
Notes: (updated with message ID)
  "Sent with message ID: alygn-1707828594302-abc123xyz
   Sent on: 2026-02-13T08:15:42.000Z"
```

### 4. Rate Limiting

**Default:** 3000ms (3 seconds) between sends

- Respects email provider rate limits
- Reduces ISP spam flags
- Allows infrastructure to log each send

**Override:**

```bash
# Fast batch (500ms delays - use with caution)
node send-approved-emails.js --rate-limit=500 --limit=5

# Slow batch (10s delays - very conservative)
node send-approved-emails.js --rate-limit=10000 --limit=3
```

## Workflow Integration

### Full End-to-End Pipeline

```
1. DISCOVERY (automated daily)
   automated-vc-discovery.js → Notion: "Not contacted"

2. RESEARCH (manual interactive)
   deepresearch-vcs.js + web_search/web_fetch
   → Notion: "Ready for outreach" + research data

3. DRAFTING (automated)
   draft-outreach-emails.js
   → Discord #annotations: Draft posted for approval

4. APPROVAL (manual)
   Andler reviews + approves in Discord
   → Updates draft status to "approved"

5. SENDING (automated but gated)
   send-approved-emails.js --limit=N
   → SMTP send + Notion tracking + Discord report

6. ENGAGEMENT (future)
   Track opens, clicks, replies
   → Update Notion engagement metrics
```

## Error Handling

### Email Validation

- ✅ Checks email format (RFC 5322 basic)
- ✅ Validates subject + body present
- ❌ Bounces invalid emails (returns error)

### SMTP Errors (TODO)

- Transient (4xx): Retry later
- Permanent (5xx): Mark failed + log
- Rate limit (429): Backoff + resume

### Notion Errors

- If update fails: Log warning, continue
- Don't fail sending if tracking fails
- Report as separate failure in summary

## Monitoring & Troubleshooting

### Success Indicators

```
📬 Email Sending Report
- Loaded: 5 approved emails
- Sent: 5 emails ✅
- Updated in Notion: 5 VCs ✅
- Failed: 0 sends
```

### Troubleshooting

**Q: "No approved drafts to send"**
A: Check that drafts have `status: "approved"` in Discord workflow

**Q: "Notion update failed"**
A: Check Notion API key; update may fail but send still succeeds

**Q: "Invalid email address"**
A: Check recipient email in draft is valid format

**Q: Want to preview before sending?**
A: Use `--dry-run` flag to see what would be sent

## Future Enhancements

### Priority 1 (MVP Complete)

- [ ] Actual SMTP implementation (nodemailer)
- [ ] Approval workflow in Discord (#annotations)
- [ ] Cron job scheduling
- [ ] Batch size recommendations (max 5-10 per day)

### Priority 2 (V1.1)

- [ ] Email open/click tracking (pixel + links)
- [ ] Reply detection + auto-logging to Notion
- [ ] Retry failed sends automatically
- [ ] A/B testing support (track subject line variants)

### Priority 3 (V2.0)

- [ ] Multi-email sequence (follow-ups)
- [ ] Personalized reply detection
- [ ] Calendar integration (optimal send times)
- [ ] Engagement scoring (open rate, reply rate, etc.)

## API Commands Summary

### Supported Commands

```
--limit=N              Send up to N emails (default: 5)
--vc-name="Name"      Send to specific VC (case-insensitive search)
--batch-id="id"       Send emails from specific batch
--dry-run             Preview without sending
--resend-failed       Retry previously failed sends
--rate-limit=ms       Milliseconds between sends (default: 3000)
```

### Combination Examples

```bash
# Send first 3 VCs with 5-second delay between each
node send-approved-emails.js --limit=3 --rate-limit=5000

# Retry all failed sends, max 10, with dry-run preview
node send-approved-emails.js --resend-failed --limit=10 --dry-run

# Send from specific batch with custom rate limit
node send-approved-emails.js --batch-id="batch-001" --rate-limit=2000
```

## Notion Schema

### Required Fields for Sending

- **Email** (email) - recipient email address
- **Status** (select) - "Ready for outreach" → "Sent"
- **Sent Date** (date) - populated on successful send
- **Notes** (rich_text) - updated with message ID + timestamp
- **Name** (title) - VC name (used in logs/reports)

### Optional Fields for Tracking

- **Message ID** (text) - unique identifier per send
- **Campaign** (select) - which outreach batch
- **Reply Date** (date) - when reply received
- **Engagement** (multi_select) - opened, clicked, replied

## Security Considerations

1. **Email Credentials**
   - Store in .env or environment (not in script)
   - Use app-specific passwords (not account password)
   - Rotate periodically

2. **Rate Limiting**
   - Respect email provider limits
   - Use authenticated SMTP (reduces spam flags)
   - Include proper headers (Message-ID, etc.)

3. **Approval Gate**
   - No sending without explicit approval
   - Discord approval provides audit trail
   - All sends logged to Notion + Discord

---

**Created:** Feb 13, 2026
**Status:** MVP ready for testing
**Next Steps:** Implement SMTP + test with 5-VC batch
