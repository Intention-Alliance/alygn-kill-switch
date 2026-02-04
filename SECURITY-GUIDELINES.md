# SECURITY GUIDELINES - CRITICAL

## Never Share Publicly

**NEVER include in public issues, logs, documentation, or external communications:**

### Personal Information
- ❌ Phone numbers (yours or anyone's)
- ❌ Email addresses (unless explicitly public)
- ❌ Real names (use placeholders like `+1234567890` or `user@example.com`)

### Identifiers
- ❌ Group IDs (Signal, WhatsApp, Discord, etc.)
- ❌ Channel IDs (private channels/groups)
- ❌ User UUIDs or internal IDs
- ❌ Session keys or any internal identifiers

### Credentials
- ❌ API keys (even partial)
- ❌ Tokens (GitHub, OpenAI, etc.)
- ❌ Passwords or passphrases
- ❌ Private keys or certificates

### Business Information
- ❌ Client/project names (unless explicitly approved)
- ❌ Financial data
- ❌ Proprietary strategies or plans
- ❌ Internal team structure

## When Creating Public Issues/Documentation

1. **Redact ALL sensitive info** before posting
2. Use placeholders:
   - Phone: `+1234567890`
   - Email: `user@example.com`
   - Group ID: `group:REDACTED`
   - API keys: `sk-***REDACTED***`
3. **Ask before sharing** if uncertain
4. Review twice before hitting "submit"

## If Mistake Happens

1. Immediately notify Andler
2. Delete/edit the content if possible
3. Rotate any exposed credentials
4. Document the incident for learning

---

**This mistake cost us privacy. Never again.**

*Created: 2026-01-31 after GitHub issue #5192 incident*
