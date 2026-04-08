# VC Outreach — Morning (Send)

**Schedule:** 9:00 AM daily (Mon-Fri)
**Purpose:** Generate and send VC outreach emails for today's wave
**Discord Thread:** 1486784711928975460

---

## Prerequisites

- Today's VC wave file exists at `$HOME/.openclaw/workspace/reports/alygn/vc-waves/YYYY-MM-DD.json`
- Wave file contains entities with status `researched` or `drafted-retry` ready for personalization
- Discord thread 1486784711928975460 is active and monitored for approval responses
- Review `~/.agents/skills/alygn-outreach/docs/DEVELOPER.md` for CLI options and phase details

---

## Instructions

1. **Read the skill documentation**
   → `~/.agents/skills/alygn-outreach/docs/DEVELOPER.md`
   → Review the `personalize` and `send` phase descriptions, CLI flags, and state file conventions

2. **Load today's wave file and identify approved entities**
   → Wave file: `$HOME/.openclaw/workspace/reports/alygn/vc-waves/YYYY-MM-DD.json`
   → Entities with status `researched` (new) or `drafted-retry` (previously failed, now revised) are ready for Phase 4 (personalize)

3. **Run Phase 4 (Personalize) via the alygn-outreach CLI**
   ```bash
   cd $HOME/.openclaw/workspace && bun ~/.agents/skills/alygn-outreach/bin/alygn-outreach.ts \
     --type=vc \
     --action=personalize \
     --input=$HOME/.openclaw/workspace/reports/alygn/vc-waves/YYYY-MM-DD.json \
     --limit=10
   ```
   → Lobster file: `.lobster/alygn-vc-outreach.lobster`
   → Each entity produces a personalized email draft

4. **Post draft snippets to Discord for approval**
   → For each draft, post to thread 1486784711928975460:
     - VC partner name
     - VC firm name
     - Draft ID (from state file)
     - 2–3 sentence snippet of the personalization
   → Example format:
     ```
     🔔 VC Draft — Awaiting Approval
     Partner: [Name] @ [Firm]
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
     --type=vc \
     --action=send \
     --draft-status=Approved \
     --email-send-to=[entity-id-1],[entity-id-2] \
     --dry-run   # Remove --dry-run to actually send
   ```
   → Only sends entities that are `Approved` and have no rejection flag

7. **Update wave file status and Discord**
   → Mark sent entities as `sent` in the wave file
   → Mark failed sends as `failed` with `retry_count` incremented
   → Post summary to thread 1486784711928975460:
     ```
     ✅ [alygn-vc-morning] Complete
     Sent: X
     Pending approval: Y
     Failed: Z
     ```

8. **Update Notion VC Outreach database**
   → Log each successful send with: entity ID, VC firm, partner name, send timestamp
   → Verify database schema before writing (see DEVELOPER.md → Supabase types)

---

## Expected Output

- Approved email drafts sent to VC contacts
- Wave file updated: `researched` → `drafted` (after personalization) → `sent` (after send)
- Discord thread updated with snippets and final status
- Notion VC Outreach database updated with send log

---

## Error Handling

| Situation | Action |
|---|---|
| Phase 4 (personalize) fails for an entity | Skip entity, log to `$HOME/.openclaw/workspace/reports/alygn/vc-waves/logs/error-log.json`, continue with others |
| No entities in wave file | Post `ℹ️ [alygn-vc-morning] No entities to process` to Discord and exit cleanly |
| Discord unreachable | Log to error-log.json, retry on next run |
| Phase 6 (send) fails | Mark entity as `failed`, increment `retry_count`, log; do NOT halt — process all remaining entities |
| Entity exhausted (3+ failures) | Mark as `exhausted`, do NOT retry further, log to dead-letter queue |
| Supabase/Notion write fails | Log error, continue; do not block sends |

> **Important:** Do not let a single entity failure halt the entire run. Process all entities.

---

## Test Mode

Add `--dry-run` flag to personalize and send commands to test without consuming API credits or sending real emails.
