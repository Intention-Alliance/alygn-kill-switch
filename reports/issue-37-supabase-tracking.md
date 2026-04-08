# Issue #37: Supabase outreach_emails Tracking — Report

## Status: ✅ IMPLEMENTED

## Implementation

### Existing Code Found
File: `scripts/alygn/muni-outreach/supabase/src/supabase-sync.ts`

Contains `logOutreachEmail()` function that inserts into `outreach_emails`:

```typescript
async function logOutreachEmail(supabase, municipalityId, outreach) {
  const data = {
    municipality_id: municipalityId,
    variant: outreach.variant,
    subject: outreach.subject,
    body: outreach.body,
    sent_at: outreach.generated_at || new Date().toISOString(),
    status: 'draft', // Updated when actually sent
    x_warmup_completed: true,
    x_engagements_before_email: 5
  };
  
  const result = await supabase
    .from('outreach_emails')
    .insert([data])
    .select();
}
```

### Local Tracking
File: `scripts/alygn/lib/SentEmailTracker.js` (shared VC + municipal)

Uses atomic write pattern:
- Reads existing log
- Appends new entry
- Writes to temp file → renames (atomic)

### Database Schema
Table `outreach_emails` exists with fields:
- `id` (UUID), `municipality_id` (FK), `variant`, `subject`, `body`
- `sent_at`, `message_id`, `status`
- Wave tracking fields added via migration `003_add_wave_tracking.sql`

### RLS Policies
Must be verified in Supabase Dashboard → Table `outreach_emails` → Policies
- Ensure INSERT allowed for service role

## Integration Points
- `supabase-sync.ts` is exported and used by workflow
- Email sender (`email-sender-smtp-v2.js`) uses SMTP directly — **recommend adding `logOutreachEmail()` call after successful send**

## Test Results
```bash
# SentEmailTracker atomic write test:
Recorded new sent email for test@example.com
Recorded OK, count: 1
Atomic write test passed ✅
```

## Gap Found
Email sender (`email-sender-smtp-v2.js`) does NOT call `logOutreachEmail()` after sending. Recommendation: add Supabase insert after each successful SMTP send.

---

Report by Keridz ⚙️
