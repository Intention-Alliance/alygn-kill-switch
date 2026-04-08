# Duplicate Prevention Fix for VC Outreach Skill

## Problem
The skill was creating duplicate Notion entries for VCs because it only checked for existing entries by email in the Notion database. The old implementation:
- Only checked `vcExistsInNotion(email)` which queried Notion by email
- Did NOT check `sent-emails.json` for local verification
- Did NOT check Notion by VC Name
- Did NOT return the existing page ID for reuse

This resulted in duplicates like Menlo Ventures appearing twice in the Notion database.

## Solution
Updated `src/core/sync-vcs-to-notion.ts` with comprehensive duplicate checking:

### New Functions

1. **`loadSentEmails()`** - Loads `sent-emails.json` from the skill's data directory
2. **`vcExistsInSentEmails(sentEmails, vcName, email)`** - Checks if VC was previously emailed
3. **`vcExistsInNotionByEmail(email)`** - Queries Notion database by Email property, returns page ID
4. **`vcExistsInNotionByName(vcName)`** - Queries Notion database by Name property (exact match)
5. **`checkVCExists(vc)`** - **Main orchestrator function** that runs all checks in order:
   - Step 1: Check `sent-emails.json` FIRST (local verification)
   - Step 2: Query Notion by email (remote verification)
   - Step 3: Query Notion by name (remote verification)

### Modified Functions

1. **`createVCInNotion(vc, existingPageId?)`** - Now accepts optional `existingPageId`:
   - If provided, updates the existing page instead of creating
   - Returns `{ id: string; created: boolean }` to indicate if new or updated

2. **`main()`** - Updated to use new duplicate check flow:
   - Calls `checkVCExists(vc)` for comprehensive verification
   - Logs source of duplicate (sent-emails, notion-email, or notion-name)
   - Logs existing page ID if found
   - Skips creating entries that already exist

## Files Modified

- `src/core/sync-vcs-to-notion.ts` (both production and dev directories)

## Verification

The build succeeds in both directories:
```bash
# Production
bun run build
# ✓ Bundled 106 modules

# Dev
bun run build
# ✓ Bundled 67 modules
```

## Export Changes

New exports added to support testing and reuse:
```typescript
export { 
  createVCInNotion, 
  loadVCsFromFile, 
  loadSentEmails,
  vcExistsInNotionByEmail,
  vcExistsInNotionByName,
  vcExistsInSentEmails,
  checkVCExists,
  type ExistingVCResult,
  type SentEmails,
  type SentEmailEntry,
  type VC,
  type SyncStats
};
```

## Output Example

When running the sync, you'll now see:
```
Processing: Menlo Ventures
   📋 Found in sent-emails.json (sent on 3/24/2026)
  ⏭️  DUPLICATE found (sent-emails): Menlo Ventures
       Previously sent: 3/24/2026
       Notion Page ID: abc123-def456

Processing: New VC Firm
  ✅ Created: New VC Firm (ID: xyz789-abc012)
```

## Prevention Flow

1. **sent-emails.json check** (fastest, no API call)
   - Match by email (exact, case-insensitive)
   - Match by vcName (exact, case-insensitive)
   
2. **Notion email query** (if email exists)
   - Query by Email property
   - Returns page ID if found
   
3. **Notion name query** (final check)
   - Query by Name property (contains)
   - Filter for exact match (case-insensitive)
   - Returns page ID if found

If any check finds a match, the VC is skipped and logged as a duplicate.
