# CC Feature for Email Outreach

## Overview
This feature adds CC functionality to the email sending system with feature flag control. When enabled, all emails sent to VCs will be CC'd to Tania (tania@alygn.us) for visibility.

## Configuration

### Environment Variables

Add these to your `.env` file or export them in your shell:

```bash
# Enable CC to Tania (set to 'true' for production)
ENABLE_CC=false

# CC Recipient (optional, defaults to tania@alygn.us)
CC_RECIPIENT=tania@alygn.us
```

### Behavior

| Mode | ENABLE_CC | Test Email | CC Added? |
|------|-----------|------------|-----------|
| Production | `true` | Not set | ✅ Yes |
| Production | `false` | Not set | ❌ No |
| Test | `true` | Set | ❌ No (disabled in test mode) |
| Test | `false` | Set | ❌ No |

## Usage

### Test Mode (CC Disabled)
```bash
node send-approved-emails.js --limit=1 --test-email=contact@andler.dev
```
Output will show: `📧 CC: Disabled (test mode)`

### Production Mode with CC Enabled
```bash
export ENABLE_CC=true
node send-approved-emails.js --limit=1
```
Output will show: `📧 CC: tania@alygn.us`

## Files Modified

1. **`scripts/alygn/vc-outreach/email/send-approved-emails.js`**
   - Added CC configuration with feature flag
   - CC is disabled when `--test-email` is used
   - Logs CC status for each email

2. **`scripts/alygn/lib/email/EmailService.js`**
   - Updated `sendEmail()` to accept and pass CC parameter
   - Added JSDoc documentation for CC parameter

3. **`scripts/alygn/lib/email/providers/SMTPProvider.js`**
   - Updated `send()` to conditionally include CC in mail options
   - Returns CC in response for tracking

## Safety Features

1. **Test Mode Protection**: CC is automatically disabled when using `--test-email` to prevent Tania from receiving test emails
2. **Default Disabled**: CC is disabled by default (ENABLE_CC defaults to false)
3. **Configurable Recipient**: CC recipient can be changed via `CC_RECIPIENT` environment variable

## Verification

Run a dry-run test to verify CC behavior:

```bash
# Test mode - CC should be disabled
node send-approved-emails.js --limit=1 --dry-run --test-email=contact@andler.dev

# Production mode - CC should be enabled (if ENABLE_CC=true)
ENABLE_CC=true node send-approved-emails.js --limit=1 --dry-run
```
