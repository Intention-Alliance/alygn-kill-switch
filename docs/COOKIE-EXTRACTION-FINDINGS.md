# Cookie Extraction Research - 2026-02-08

## Summary
✅ Bun + SQLite can read Chrome's Cookies database  
❌ Cookies are encrypted via Linux DPAPI/Keyring (can't decrypt without system integration)  
✅ Browser relay (`profile="alygn"`) is the most practical solution (already working)

---

## What We Tried

### 1. Direct SQLite Query ❌
**Status:** Readable but values are encrypted

```bash
sqlite3 $HOME/.config/google-chrome/Default/Cookies \
  "SELECT name, value FROM cookies WHERE host_key = '.x.com'"
```

**Result:** 
- Cookies are present: `auth_token`, `ct0`, `guest_id`, etc.
- Values are encrypted (BLOB data, not readable text)
- Linux uses DPAPI via system keyring

---

### 2. Bun + better-sqlite3 ❌
**Error:** `better-sqlite3 not yet supported in Bun`

---

### 3. Bun + bun:sqlite ✅ (Partial)
**Status:** Reads DB successfully, but values are still encrypted

```typescript
// Works:
const db = new Database("$HOME/.config/google-chrome/Default/Cookies", { readonly: true });
const cookies = db.query("SELECT * FROM cookies...").all();

// Problem:
// cookies[].value = encrypted blob data (can't use)
```

---

### 4. Chrome DevTools Protocol (CDP) ⏳ (Not Yet Tested)
**Concept:** Connect to Chrome via `--remote-debugging-port` and extract cookies directly from the browser process (no encryption)

**Setup:**
```bash
google-chrome --profile-directory="alygn" --remote-debugging-port=9222 &
# Then use Puppeteer or simple CDP client to fetch cookies
```

**Status:** Not yet implemented (requires CDP library)

---

## The Practical Solution ✅

**Current:** Browser relay with `profile="alygn"` flag

**Why it works:**
- Chrome is already running with authentication
- OpenClaw's browser tool has full access to the authenticated session
- No cookie extraction needed—use the browser directly!

**Evidence:**
- ✅ Posted 4-post thread successfully
- ✅ Navigated to X.com without auth errors
- ✅ Compose dialog works
- ✅ All X.com features accessible

**Implementation:**
```bash
# For any X.com action:
browser --profile="alygn" --action=[navigate|snapshot|act] ...
```

---

## Why Cookies Are Encrypted

**Linux Chrome Security:**
1. Cookies stored in SQLite database: `$HOME/.config/google-chrome/Default/Cookies`
2. Each cookie's `value` field is encrypted using Chromium's encryption key
3. Encryption key is stored in system keyring (via `secret-tool` on Linux)
4. To decrypt: need keyring password OR Chrome process running (has key in memory)

**Windows/macOS:**
- Windows: Uses DPAPI (CryptProtectData)
- macOS: Uses Keychain

---

## Future Options (If Needed)

### Option A: Chrome DevTools Protocol (Best)
```bash
# Start Chrome with debugging
google-chrome --remote-debugging-port=9222 &

# Connect via CDP client (Puppeteer, etc.)
# Get cookies without decryption
const cookies = await page.cookies();
```

**Pros:** No decryption, works on all platforms  
**Cons:** Requires CDP implementation, Chrome must be running  

### Option B: Chrome --password-store=basic
```bash
# Start Chrome without encryption
google-chrome --password-store=basic

# Cookies stored in plaintext (only for testing!)
```

**Pros:** Plaintext cookies, easy to read  
**Cons:** Insecure, only for development  

### Option C: Node.js + keyring library
```bash
npm install keytar  # or libsecret on Linux
const password = await keytar.getPassword("Chrome Safe Storage", "Chrome");
// Decrypt cookies using password
```

**Pros:** Integrates with system keyring  
**Cons:** Complex, requires OS integration  

---

## Recommendation

**Use the browser relay** (`--profile="alygn"`) for X.com automation.

**Reasoning:**
1. ✅ Already working perfectly
2. ✅ No cookie extraction complexity
3. ✅ Secure (uses Chrome's own authentication)
4. ✅ One command: `browser --profile="alygn"` [action]

**For future scaling:**
- If we need non-browser automation (cron jobs without GUI):
  - Implement Chrome DevTools Protocol (CDP) extraction
  - Or use X API directly (when write access available)
  - Or configure Chrome with `--password-store=basic` for development

---

## Files Created

1. `extract-chrome-cookies.ts` - SQLite + Bun approach (reads encrypted values)
2. `extract-cookies-via-cdp.ts` - CDP approach (skeleton, needs Puppeteer integration)
3. This doc - findings & recommendations

---

*Date: 2026-02-08*  
*Conclusion: Browser relay is the MVP solution. CDProtocol is the future.*
