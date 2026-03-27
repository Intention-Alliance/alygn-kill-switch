# Two-Filter System Implementation Summary

## Problem Solved
**Issue:** Drafts created for VCs A, B, C → Script sends to VCs X, Y, Z (mismatch)

**Solution:** Two-Filter System ensures drafts connect to actual sends with explicit approval

---

## Files Modified

### 1. `$HOME/.agents/skills/alygn-outreach/src/strategies/personalization/VCPersonalizationStrategy.js`
**Changes:**
- Added Notion client import and initialization
- Added `loadDatabaseId()` method to load Notion database config
- Added `updateNotionDraftStatus()` method to update Notion
- Modified `personalize()` method to:
  - Generate unique `draftId` (`draft-${entity.id}-${Date.now()}`)
  - Set `entity.draftStatus = 'Drafted'`
  - Set `entity.draftCreatedAt` timestamp
  - Update Notion `Draft Status` property to "Drafted"
  - Return `draftId` and `draftStatus` in result

### 2. `$HOME/.agents/skills/alygn-outreach/src/strategies/sending/SendingStrategy.js`
**Changes:**
- Added Notion client import and initialization
- Added `loadDatabaseId()` method
- Added `updateNotionDraftStatus()` method
- Modified `send()` method to implement TWO-FILTER SYSTEM:
  - **Filter 1:** Check `entity.draftStatus` matches `options.draftStatus` (default: "Approved")
  - **Filter 2:** Check `entity.id` is in `options.sendToList` (if provided)
  - Returns skip reason if filters don't match
- Modified success path to:
  - Set `entity.draftStatus = 'Sent'`
  - Update Notion `Draft Status` to "Sent"

### 3. `$HOME/.agents/skills/alygn-outreach/src/core/Pipeline.js`
**Changes:**
- Modified `runSend()` to accept `draftStatus` and `sendToList` options
- Pass these options to `strategy.send()`

### 4. `$HOME/.agents/skills/alygn-outreach/src/index.js`
**Changes:**
- Added CLI argument parsing for:
  - `--draft-status=Approved` (Filter 1)
  - `--email-send-to=id1,id2,id3` (Filter 2)
- Pass these options to `pipeline.run()`

### 5. `$HOME/.openclaw/workspace/.lobster/alygn-campaign.lobster`
**Changes:**
- Updated Phase 6 command to use two-filter system:
  ```yaml
  command: node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=send --draft-status=Approved --email-send-to={approved_ids} --limit=5
  ```
- Added documentation comments explaining the two-filter system

### 6. `$HOME/.openclaw/workspace/scripts/alygn/vc-outreach/email/send-approved-emails.js`
**Changes:**
- Updated header documentation with TWO-FILTER SYSTEM explanation
- Modified `getApprovedVCs()` to accept `draftStatus` and `sendToList` parameters
- Modified `updateVCStatus()` to also update `Draft Status` field when sending
- Modified `main()` to parse new CLI arguments:
  - `--draft-status=Approved`
  - `--email-send-to=vc_1,vc_2,vc_3`

---

## Notion Schema Changes Required

Add the following property to the VC database:

```json
{
  "property": "Draft Status",
  "type": "select",
  "options": [
    "Not drafted",
    "Drafted",
    "Approved",
    "Rejected",
    "Sent"
  ]
}
```

---

## Usage Examples

### Generate Drafts (Phase 4)
```bash
node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=personalize --limit=3
# → Updates Notion: Draft Status = "Drafted"
# → Generates draftId for each VC
```

### Approve Drafts (Phase 5 - Manual)
```
In Notion, set Draft Status = "Approved" for VCs to send to
```

### Send Approved Drafts (Phase 6)
```bash
# Using alygn-outreach skill
node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=send --draft-status=Approved --email-send-to=vc_abc123,vc_def456

# Using send-approved-emails.js
node scripts/alygn/vc-outreach/email/send-approved-emails.js --draft-status=Approved --email-send-to=vc_abc123,vc_def456
```

---

## Verification Test Steps

1. **Generate drafts for 3 VCs:**
   ```bash
   node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=personalize --limit=3
   ```
   - Check Notion: Draft Status should be "Drafted" for these VCs
   - Check output: Each VC should have a `draftId`

2. **Approve 2 VCs in Notion:**
   - Set Draft Status = "Approved" for 2 of the 3 VCs

3. **Send ONLY approved (dry-run):**
   ```bash
   node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=send --draft-status=Approved --email-send-to=vc_1,vc_2 --dry-run
   ```
   - Should show: 2 would send, 1 filtered out (wrong status)

4. **Send ONLY approved (real):**
   ```bash
   node $HOME/.agents/skills/alygn-outreach/bin/alygn-outreach --type=vc --action=send --draft-status=Approved --email-send-to=vc_1,vc_2
   ```
   - Should send ONLY to vc_1 and vc_2
   - Should update Notion: Draft Status = "Sent" for sent VCs

---

## Key Benefits

1. **Explicit Approval:** Only VCs with Draft Status = "Approved" can be sent to
2. **Explicit Targeting:** Only VCs with IDs in `--email-send-to` list are processed
3. **Audit Trail:** Draft Status tracks the full lifecycle (Not drafted → Drafted → Approved/Rejected → Sent)
4. **Safety:** Prevents accidental sends to wrong VCs
5. **Flexibility:** Can filter by status alone, send list alone, or both

---

## Implementation Date
March 19, 2026
