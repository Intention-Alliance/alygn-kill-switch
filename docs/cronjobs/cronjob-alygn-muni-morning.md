# Municipal Outreach — Morning (Send)

**Schedule:** 10:00 AM daily (Mon-Fri)
**Purpose:** Generate and send municipal outreach emails for today's wave
**Discord Thread:** 1486784946134712500

---

## Prerequisites

- Today's municipal wave file exists at `$HOME/.openclaw/workspace/reports/alygn/muni-waves/YYYY-MM-DD.json`
- Wave file contains entities with status `researched` or `drafted-retry` ready for personalization
- Discord thread 1486784946134712500 is active and monitored for approval responses
- Review `~/.agents/skills/alygn-outreach/docs/DEVELOPER.md` for CLI options and phase details
- Supabase database connection is verified (see DEVELOPER.md → Supabase variables)

---

## Instructions

1. **Read the skill documentation**
   → `~/.agents/skills/alygn-outreach/docs/DEVELOPER.md`
   → Review the `personalize` and `send` phase descriptions, CLI flags, and state file conventions

2. **Load today's wave file and identify approved entities**
   → Wave file: `$HOME/.openclaw/workspace/reports/alygn/muni-waves/YYYY-MM-DD.json`
   → Entities with status `researched` (new) or `drafted-retry` (previously failed, now revised) are ready for Phase 4 (personalize)

3. **Run Phase 4 (Personalize) via the alygn-outreach CLI**
   ```bash
   cd $HOME/.openclaw/workspace && bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
     --type=municipal \
     --region=costa-rica \
     --action=personalize \
     --input=$HOME/.openclaw/workspace/reports/alygn/muni-waves/YYYY-MM-DD.json \
     --limit=10
   ```
   → Lobster file: `.lobster/alygn-muni-outreach.lobster`
   → Each entity produces a personalized email draft targeting the mayor/municipal contact

4. **Post draft snippets to Discord for approval**
   → For each draft, post to thread 1486784946134712500:
     - Mayor/municipal contact name
     - Municipality name
     - Draft ID (from state file)
     - 2–3 sentence snippet of the personalization
   → Example format:
     ```
     🔔 Municipal Draft — Awaiting Approval
     Contact: [Name] @ [Municipality]
     Draft ID: [uuid]
     Snippet: "[2-3 sentence preview...]"
     ```

5. **Wait for approval reactions/responses on Discord**
   → Approved = reaction ✅ or explicit approval in thread
   → Rejected = reaction ❌ or explicit rejection — skip this entity
   → Only proceed with sends for explicitly approved drafts

6. **Run Phase 6 (Send) for approved drafts**
   ```bash
   cd $HOME/.openclaw/workspace && bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
     --type=municipal \
     --region=costa-rica \
     --action=send \
     --draft-status=Approved \
     --email-send-to=[entity-id-1],[entity-id-2] \
     --dry-run   # Remove --dry-run to actually send
   ```
   → Only sends entities that are `Approved` and have no rejection flag

7. **Update wave file status and Discord**
   → Mark sent entities as `sent` in the wave file
   → Mark failed sends as `failed` with `retry_count` incremented
   → Post summary to thread 1486784946134712500:
     ```
     ✅ [alygn-muni-morning] Complete
     Sent: X
     Pending approval: Y
     Failed: Z
     ```

8. **Update Supabase database**
   → Log each successful send with: entity ID, municipality name, mayor name, send timestamp
   → Verify database schema before writing (see DEVELOPER.md → Supabase types and migrations)

---

## Expected Output

- Approved email drafts sent to municipal contacts
- Wave file updated: `researched` → `drafted` (after personalization) → `sent` (after send)
- Discord thread updated with snippets and final status
- Supabase municipal outreach database updated with send log

---

## Error Handling

| Situation | Action |
|---|---|
| Phase 4 (personalize) fails for an entity | Skip entity, log to `$HOME/.openclaw/workspace/reports/alygn/muni-waves/logs/error-log.json`, continue with others |
| No entities in wave file | Post `ℹ️ [alygn-muni-morning] No entities to process` to Discord and exit cleanly |
| Discord unreachable | Log to error-log.json, retry on next run |
| Phase 6 (send) fails | Mark entity as `failed`, increment `retry_count`, log; do NOT halt — process all remaining entities |
| Entity exhausted (3+ failures) | Mark as `exhausted`, do NOT retry further, log to dead-letter queue |
| Supabase write fails | Log error, continue; do not block sends |
| Municipal contact lacks valid email | Mark as `no-contact`, skip send, log with reason |

> **Important:** Do not let a single entity failure halt the entire run. Process all entities.

---

## Test Mode

Add `--dry-run` flag to personalize and send commands to test without consuming API credits or sending real emails.
