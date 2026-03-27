# CRITICAL FIX 2: Unified Code Paths with Absolute Paths

## Summary

Successfully unified all code paths in the Alygn VC outreach email system to use absolute paths with `$HOME`. This ensures consistent validation, eliminates bypass vulnerabilities, and creates a single entry point for all email sending operations.

## Files Updated

### Primary Entry Point (Single Send Path)
1. **`scripts/alygn/vc-outreach/email/send-approved-emails.js`**
   - Now uses dynamic imports with absolute paths
   - Single validation layer: ZeroBounce, SentEmailTracker, Notion status checks
   - All imports use `path.join(process.env.HOME, ...)`
   - All file reads use `path.resolve(process.env.HOME, ...)`

### Supporting Files (Email Drafting)
2. **`scripts/alygn/vc-outreach/email/draft-outreach-emails.js`**
   - Updated to use absolute paths for Notion client and email template imports
   - Uses `path.resolve()` for config file loading

### Email Library Files
3. **`scripts/alygn/lib/email/EmailService.js`**
4. **`scripts/alygn/lib/email/EmailProviderFactory.js`**
5. **`scripts/alygn/lib/email/providers/SMTPProvider.js`**
6. **`scripts/alygn/lib/email/providers/SmartleadProvider.js`**
7. **`scripts/alygn/lib/email/validators/ZeroBounceValidator.js`**
8. **`scripts/alygn/lib/email/validators/RegexMXValidator.js`**
9. **`scripts/alygn/lib/email/validators/EmailValidatorFactory.js`**
10. **`scripts/alygn/lib/email/validators/quick-validate.js`**
11. **`scripts/alygn/lib/SentEmailTracker.js`**
    - Changed log file path from `/tmp/alygn-sent-emails.json` to absolute path in workspace

### VC Outreach Tracking Files
12. **`scripts/alygn/vc-outreach/tracking/deep-research-vcs.js`**
13. **`scripts/alygn/vc-outreach/tracking/vc-outreach.js`**
14. **`scripts/alygn/vc-outreach/tracking/vc-discovery-curation.js`**
15. **`scripts/alygn/vc-outreach/populate-vc-data.js`**
16. **`scripts/alygn/vc-outreach/core/sync-vcs-to-notion.js`**

## Pattern Used

All files now follow this pattern:

```javascript
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const SHARED_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/shared');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');

// Dynamic imports with absolute paths
const notionClient = await import(path.join(SHARED_DIR, 'notion-client.js'));
const { getClient, queryDatabase } = notionClient;

// File operations with absolute paths
const configPath = path.resolve(WORKSPACE_ROOT, 'config/credentials.json');
```

## Verification

### Syntax Check
All files pass Node.js syntax validation:
```bash
node --check <file.js>
```

### No Relative Imports Remaining
```bash
grep -r "from '\." scripts/alygn/vc-outreach/ scripts/alygn/lib/email/ --include="*.js" | grep -v node_modules
# Returns empty (no relative imports)
```

## Single Validation Layer

The unified `send-approved-emails.js` now contains the ONLY validation logic:

1. **ZeroBounce validation** - Blocks invalid/do_not_mail emails
2. **SentEmailTracker check** - Prevents duplicate sends
3. **Notion status check** - Only sends if status is "Ready for outreach"

No other code paths can bypass these validations.

## Security Improvements

- ✅ No relative imports that could be hijacked
- ✅ All file paths resolved to absolute paths
- ✅ Single entry point for email sending
- ✅ Validation cannot be bypassed through alternative imports
- ✅ Consistent behavior across all execution contexts

## Testing

Run a dry-run test to verify the unified path works:
```bash
cd $HOME/.openclaw/workspace
node scripts/alygn/vc-outreach/email/send-approved-emails.js --limit=1 --dry-run
```

## Date Completed
March 19, 2026