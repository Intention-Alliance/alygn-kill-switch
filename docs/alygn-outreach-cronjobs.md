# Alygn Outreach Cronjob Task Prompts
# These are explicit instructions for the cronjob agents

## 1. Municipal Outreach Daily Cronjob

**Schedule:** 0 9 * * 1-5 (9:00 AM, Monday-Friday, America/Costa_Rica)
**Agent:** agent-alygn-muni-outreach
**Channel:** Discord #annotations (1466532145257255004)

### Task Prompt:
```
Execute Municipal Outreach Pipeline for Costa Rica municipalities.

STEP 1: Discovery
- Run: cd $HOME/.openclaw/workspace && node scripts/alygn/muni-outreach/discovery/muni-discovery.js
- This loads 82 cantones from costa-rica-real-municipalities.json
- Output: municipalities with name, province, population

STEP 2: Research  
- Run: node scripts/alygn/muni-outreach/research/muni-research.js
- This finds mayor names and emails from pre-verified data
- Input: municipalities from Step 1
- Output: researched municipalities with contacts.mayor_name and contacts.mayor_email

STEP 3: Personalization
- Run: node scripts/alygn/muni-outreach/personalization/muni-personalizer.js
- This generates Spanish email content using Grok
- Input: researched municipalities from Step 2
- Output: municipalities with outreach.subject, outreach.body, outreach.variant

STEP 4: Send Test Emails
- Run: node scripts/alygn/muni-outreach/sending/email-sender-smtp-v2.js --input=/tmp/muni-personalized.json --test-email=contact@andler.dev
- This sends emails to YOUR address for testing
- Uses shared email-sender.js with nodemailer
- Logs results to /tmp/muni-sent.json

STEP 5: Report
- Post summary to Discord #annotations
- Include: number of municipalities processed, emails sent, any errors

DO NOT send to real mayors. Only use --test-email flag.
```

---

## 2. VC Outreach Daily Cronjob

**Schedule:** 0 10 * * 1-5 (10:00 AM, Monday-Friday, America/Costa_Rica)
**Agent:** agent-alygn-vc-outreach
**Channel:** Discord #annotations (1466532145257255004)

### Task Prompt:
```
Execute Alygn VC outreach with two-filter system ensuring drafts connect to sends.

WORKFLOW:
1. CHECK: Verify 100 VCs in Notion with Draft Status
2. PERSONALIZE: Run personalization for approved VCs
   - Generate personalized drafts with partner names
   - Set Draft Status = "Drafted" in Notion
3. REVIEW: Check Discord #annotations for approval
   - Approved VCs: Draft Status = "Approved"
   - Rejected VCs: Draft Status = "Rejected"
4. SEND: Execute send ONLY with both filters:
   - Filter 1: --draft-status=Approved
   - Filter 2: --email-send-to=approved_entity_ids
   - Example: node send-approved-emails.js --draft-status=Approved --email-send-to=id1,id2
5. VERIFY: Confirm sends recorded in SentEmailTracker
   - Check Notion: Draft Status updated to "Sent"
   - Check for bounce notifications
   - Report summary to Discord

CRITICAL: 
- NEVER send without --email-send-to (random selection)
- ALWAYS use both filters together
- VERIFY entity IDs match between personalize and send

Use absolute paths with $HOME/.openclaw/workspace
```

---

## Key Points for Both Cronjobs:

1. **Always use --test-email=contact@andler.dev** - Never send to real recipients
2. **Respect rate limits** - 3 second delay between emails
3. **Log everything** - Save results to /tmp/ for debugging
4. **Report to Discord** - Post summary to #annotations channel
5. **Update Notion** - Mark statuses after sending

## Deployment Checklist:

- [ ] Shared email-sender.js tested and working
- [ ] Both --test-email flags tested with contact@andler.dev
- [ ] Notion databases configured
- [ ] Discord channel IDs verified
- [ ] SMTP credentials validated
- [ ] Rate limiting configured (3s between sends)
```