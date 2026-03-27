# ALYGN VC Outreach - March 23, 2026 Learnings

## Campaign Summary

**Date:** March 23, 2026  
**VCs Sent:** 4 (Lightspeed VP, Union Square Ventures, Red Glass Ventures, DCVC)  
**Status:** ✅ All emails sent successfully with personalized content

---

## Critical Observations & Fixes Applied

### 1. ❌ CC Issue - Tania Not Added

**Problem:** The `email-sender-SMTP.js` has CC capability but didn't add Tania (`tanialeaidm@gmail.com`) in production.

**Root Cause:** Missing production flag or default CC behavior.

**Fix Required:**
- Add explicit `--cc` flag to send script
- Always CC Tania in production mode
- Use `--dry-run` mode to skip CC during testing

**Code Pattern:**
```javascript
// In send-approved-emails.js
const ccRecipient = isProduction ? CONFIG.ccRecipient : null;
// ...
await emailService.send({
  to: vc.email,
  cc: ccRecipient, // Only set in production
  // ...
});
```

---

### 2. ✅ Draft Generation Workflow Improvements

**Problem:** Initial drafts were generated manually without using the official template.

**Solution:** Regenerated all 4 drafts using `outreach-email-template.js` to ensure:
- ✅ Proper HTML structure with ALYGN branding
- ✅ Correct email: `tanialeaidm@gmail.com`
- ✅ English PS (not Spanish): "P.S.: This message was AI-generated..."

**Draft Structure Required:**
```json
{
  "vc": {
    "name": "VC Name",
    "email": "partner@vc.com",
    "website": "https://vc.com",
    "relevanceScore": 9,
    "pageId": "notion-page-id",
    "id": "vc-{nanoid}"  // ← CRITICAL: Must match Notion ID field
  },
  "subjects": { "optionA": "...", "optionB": "...", "optionC": "..." },
  "variant": "institutional",
  "emailHTML": {
    "subject": "...",
    "html": "<!-- from outreach-email-template.js -->",
    "text": "..."
  }
}
```

---

### 3. 🧠 Context Persistence Strategy

**Problem:** During heavy research tasks, lost track of next steps and specific requirements.

**Solution Implemented:**
- Save intermediate state after each major step
- Document conclusions before moving to next step
- Reference previous step conclusions when resuming

**Pattern:**
```
Step 1: Research → Save findings to /tmp/research-{vc}.json
Step 2: Draft → Reference research, save draft to drafts/
Step 3: Review → Check against requirements
Step 4: Send → Load draft, verify Notion status
```

---

### 4. ✅ ID Field Critical Fix

**Problem:** Notion database "ID" field was empty for all 99 VCs.

**Impact:** Send script couldn't match drafts to Notion entries.

**Fix Applied:**
- Populated all 99 VCs with `vc-{nanoid(6)}` IDs
- Pattern: `vc-uYO7K2`, `vc-TICg3q`, etc.
- Drafts now include matching ID field for proper linkage

---

### 5. ⚠️ ARCHITECTURAL CHANGE: Cronjob Configuration

**CRITICAL LEARNING (March 23, 2026):**

Cronjobs are **NO LONGER configured in `openclaw.json`** directly.

**New Approach:**
1. **Lobster files** (`~/.openclaw/workspace/.lobster/*.lobster`) - For repetitive actions
2. **AGENTS.md** - For agent task specifications
3. **Both** - Sometimes using both is better
4. **Trade-off:** Long AGENTS.md affects context window

**Current Lobster Files:**
- `alygn-campaign.lobster` - VC outreach workflow
- `alygn-x-growth-daily.lobster` - Twitter automation
- `x-growth.lobster` - X/Twitter growth

**Recommendation:**
- Use **lobster** for complex workflows with multiple steps
- Use **AGENTS.md** for high-level agent routing rules
- Keep AGENTS.md concise to preserve context window

---

## New Patterns Discovered

### Email Validation Pattern (from March 20)
- ✅ Personal emails (guru@, albert@, matt@) → Sent successfully
- ❌ Generic emails (hello@, invest@) → Blocked by validation
- **Action:** Always research partner names before drafting

### VC Priority Queue
High-priority VCs with personal emails (ready for next batch):
1. Lightspeed VP (guru@lsvp.com) - ✅ Sent
2. Union Square (albert@usv.com) - ✅ Sent
3. Red Glass (bilal@redglass.vc) - ✅ Sent
4. DCVC (matt@dcvc.com) - ✅ Sent
5. Innovation Endeavors (harpi@innovationendeavors.com) - Ready
6. Air Street Capital (nathan@airstreet.com) - Already sent

---

## Workflow Documentation Required

### Draft Generation Checklist
- [ ] Use official `outreach-email-template.js` for HTML
- [ ] Verify Tania email: `tanialeaidm@gmail.com`
- [ ] English PS (not Spanish)
- [ ] Include `vc.id` matching Notion ID field
- [ ] Update Notion Draft Status to "Drafted"
- [ ] Post to Discord for approval

### Send Workflow Checklist
- [ ] VCs marked "Approved" in Notion
- [ ] Verify personal emails (not generic)
- [ ] Include Tania CC in production
- [ ] Use `--email-send-to=vc-id1,vc-id2` filter
- [ ] Update Notion Status to "Sent" after confirmation

---

## Technical Debt to Address

1. **Send Script CC Logic:** Add explicit `--cc` flag or production mode detection
2. **Draft Generator:** Ensure it always uses official template
3. **ID Sync:** Create script to verify all VCs have ID fields populated
4. **Pain Point Personalization:** Improve VC research to extract specific pain points from portfolio
5. **Cronjob Migration:** Move any remaining openclaw.json cron configs to lobster files

---

## Files Updated

- `~/.openclaw/workspace/scripts/alygn/vc-outreach/drafts/draft-vc-8mrB1M.json` (Lightspeed)
- `~/.openclaw/workspace/scripts/alygn/vc-outreach/drafts/draft-vc-wSLW0q.json` (USV)
- `~/.openclaw/workspace/scripts/alygn/vc-outreach/drafts/draft-vc-j09Q5b.json` (Red Glass)
- `~/.openclaw/workspace/scripts/alygn/vc-outreach/drafts/draft-vc-dcjSDv.json` (DCVC)
- Notion database: 99 VCs updated with `vc-{nanoid}` IDs
- `~/.openclaw/workspace/.lobster/alygn-campaign.lobster` - Existing workflow file

---

## Next Steps

1. Monitor replies for the 4 sent emails
2. Research next batch of VCs with personal emails
3. Fix CC logic in send script before next campaign
4. Document final workflow in SKILL.md
5. Review existing lobster files for completeness

---

**Agent Routing Note (March 23):**
- fe-coder → Frontend/component work
- docs-writer → Technical documentation  
- **be-coder (Keridz)** → Backend/infrastructure systems ← Use for backend tasks

---

*Documented: March 23, 2026*  
*Wobblus Chain-of-Thought Session*