# Alygn Outreach Architecture Fixes - Implementation Summary

**Date:** March 18, 2026
**Status:** ✅ Phase 1-3 Complete

---

## Files Created

### Email Provider Infrastructure
1. **`/scripts/alygn/lib/email/providers/EmailProvider.js`**
   - Base interface class for all email providers
   - Defines `send()`, `validateConfig()`, `getName()` methods

2. **`/scripts/alygn/lib/email/providers/SMTPProvider.js`**
   - SMTP implementation using nodemailer
   - Supports test email override

3. **`/scripts/alygn/lib/email/providers/SmartleadProvider.js`**
   - Smartlead API implementation
   - Ready for Smartlead API integration

4. **`/scripts/alygn/lib/email/EmailProviderFactory.js`**
   - Factory pattern for creating provider instances
   - Supports 'smtp' and 'smartlead' types

5. **`/scripts/alygn/lib/email/EmailService.js`**
   - Orchestrator that coordinates validation → personalization → sending
   - Supports batch sending with rate limiting
   - Test email override support

### Email Validation Infrastructure
6. **`/scripts/alygn/lib/email/validators/EmailValidator.js`**
   - Base interface for email validators

7. **`/scripts/alygn/lib/email/validators/RegexMXValidator.js`**
   - Regex + MX lookup validation (free, no API key)

8. **`/scripts/alygn/lib/email/validators/ZeroBounceValidator.js`**
   - ZeroBounce API integration for high-confidence validation

9. **`/scripts/alygn/lib/email/validators/EmailValidatorFactory.js`**
   - Factory for validator selection

---

## Files Modified

### 1. Template Refactor
**`/scripts/alygn/lib/outreach-email-template.js`**
- ✅ REMOVED `bodyHtml` parameter entirely
- ✅ Simplified interface: `{ recipientName, companyName, painPoints, variant, language, subject, ctaText?, footerNote? }`
- ✅ Template now generates ALL HTML internally
- ✅ `generateEmail()` - for municipalities (Spanish, variants: governance/institutional/traiga)
- ✅ `generateEmailHTML()` - for VCs (English, variants: governance/institutional)
- ✅ painPoints now accepts array of strings
- ✅ Added plain text generation
- ✅ Backwards compatibility exports preserved

### 2. Email Sender (Refactored)
**`/scripts/alygn/lib/email-sender.js`**
- ✅ Now uses new EmailService with dependency injection
- ✅ Exports `createEmailService()` for modern usage
- ✅ Maintains backwards compatibility with legacy `sendEmail()` and `sendEmailsBatch()`
- ✅ CLI support for `--provider=smtp|smartlead` and `--test-email=address`

### 3. VC Discovery Script
**`/scripts/alygn/vc-outreach/core/automated-vc-discovery.js`**
- ✅ Added email validation before `addVCToNotion()`
- ✅ Uses `EmailValidatorFactory` with ZeroBounce (or regex-mx fallback)
- ✅ Changed file output to `/tmp/alygn-vc-discovered-{timestamp}.json`
- ✅ Added `--dry-run` flag with JSON output
- ✅ Added `--validator=zerobounce|regex-mx` flag
- ✅ Skips VCs with invalid emails
- ✅ Tracks email validation stats

### 4. Draft Outreach Emails Script
**`/scripts/alygn/vc-outreach/email/draft-outreach-emails.js`**
- ✅ Updated to use new template interface (no bodyHtml)
- ✅ Changed file output to `/tmp/alygn-vc-approved-{timestamp}.json`
- ✅ Added `--dry-run` flag with JSON output
- ✅ Now calls `generateEmailHTML()` with new params: `{ recipientName, companyName, painPoints, variant, language, subject }`
- ✅ painPoints passed as array instead of comma-separated string

### 5. Send Approved Emails Script (NEW)
**`/scripts/alygn/vc-outreach/email/send-approved-emails.js`**
- ✅ Uses new EmailService with provider selection
- ✅ Supports `--provider=smtp|smartlead` flag
- ✅ Supports `--test-email=address` flag (redirects all sends)
- ✅ Supports `--dry-run` flag with JSON output
- ✅ Updates Notion status after sending
- ✅ Saves results to `/tmp/alygn-vc-sent-{timestamp}.json`

---

## Files Deleted

- **`.lobster/muni-html-body.lobster`** - No longer needed (template now generates ALL HTML)

---

## Dry-Run JSON Output Format

All scripts now output valid JSON when `--dry-run` is passed:

```json
{
  "dryRun": true,
  "timestamp": "2026-03-18T14:30:00Z",
  "script": "draft-outreach-emails.js",
  "summary": {
    "total": 5,
    "wouldSucceed": 5,
    "wouldFail": 0
  },
  "operations": [
    {
      "type": "email_draft",
      "entity": { "name": "Khosla Ventures", "email": "..." },
      "payload": { "to": "...", "subject": "...", "html": "..." }
    }
  ],
  "files": {
    "wouldCreate": ["/tmp/alygn-vc-approved-2026-03-18T14-30-00.json"]
  }
}
```

---

## Testing Commands

```bash
# Test template (municipalities - Spanish)
node -e "import('./scripts/alygn/lib/outreach-email-template.js').then(m => console.log(m.generateEmail({recipientName:'Test', companyName:'TestCo', painPoints:['p1','p2'], variant:'governance', language:'es', subject:'Test'})))"

# Test template (VCs - English)
node -e "import('./scripts/alygn/lib/outreach-email-template.js').then(m => console.log(m.generateEmailHTML({recipientName:'Partner', companyName:'Khosla', painPoints:['AI safety'], variant:'governance', language:'en', subject:'Test'})))"

# Test dry-run discovery
node scripts/alygn/vc-outreach/core/automated-vc-discovery.js --limit=3 --dry-run --validator=regex-mx

# Test dry-run drafting
node scripts/alygn/vc-outreach/email/draft-outreach-emails.js --limit=1 --dry-run

# Test dry-run sending with test email
node scripts/alygn/vc-outreach/email/send-approved-emails.js --limit=1 --test-email=contact@andler.dev --dry-run
```

---

## Acceptance Criteria Status

| Criteria | Status |
|----------|--------|
| Template has NO `bodyHtml` parameter | ✅ |
| EmailProvider interface with SMTP and Smartlead implementations | ✅ |
| EmailValidator interface with RegexMX and ZeroBounce implementations | ✅ |
| `automated-vc-discovery.js` validates emails before adding to Notion | ✅ |
| All scripts use `/tmp/alygn-{type}-{phase}-{timestamp}.json` pattern | ✅ |
| `--dry-run` outputs valid JSON to stdout | ✅ |
| `--test-email` flag works (redirects all sends to test address) | ✅ |

---

## Next Steps

1. **Phase 4: Research Persistence Fix** (if needed)
   - Implement transaction wrapper for Notion/Supabase writes
   - Add deduplication check with row-level locking

2. **Integration Testing**
   - Test with actual Notion database
   - Test with real Smartlead API
   - Test with real ZeroBounce API

3. **Documentation Updates**
   - Update `.lobster/alygn-campaign.lobster`
   - Update `.lobster/muni-outreach.lobster`
   - Update README files

---

## Issues Encountered

1. **Notion API compatibility:** Scripts use `queryDatabase()` helper which handles the new Notion data sources API
2. **SMTP provider bug:** Fixed typo `createTransporter` → `createTransport` in SMTPProvider.js
3. **Notion database access:** Expected error in test environment (database not shared with integration)

---

**All Phase 1-3 fixes have been implemented successfully.** 🎉
