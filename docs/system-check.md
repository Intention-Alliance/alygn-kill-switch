# System Check Results - 2026-01-30 13:12

## Current Status

### ✅ Working

- Gateway running (PID 4019)
- Bun installed (`$HOME/.local/share/mise/shims/bun`)
- GitHub Copilot auth active
- Webchat connected
- Config loaded and parsed

### ❌ Missing / Broken

#### Plugins (NOT INSTALLED)

Gateway errors show these plugins are referenced but not found:

- `google-antigravity-auth` - needed for Google OAuth
- `discord` - needed for Discord bot
- `whatsapp` - needed for WhatsApp pairing
- `memory-core` - core memory plugin

#### Skills (Need Installation)

Skills are in OpenClaw package but need CLI tools installed:

- `whisper` - CLI not found (needed for Spanish audio transcription)
- `goplaces` - Google Places API CLI
- Binance API integration (needs testing)

#### API Keys Configured (In Config)

- ✅ ElevenLabs (SAG/Talk): `sk_7f57cffd5f0cff8c4810b554c69d1e8ecb2de9d7814ca389`
- ✅ Google Places: `AIzaSyAAf8Oj4vpAGAIeNZRySIoZnt6Crer8UDs`
- ✅ Google (nano-banana-pro): `AIzaSyCxCDgvJeCHvo5nkpXtg6khd9GGs_9iJLw`
- ✅ OpenAI: `sk-proj-se4COKtLurr...`
- ✅ Binance: `msBy6NEx1hve...`

### 🔧 Required Actions

1. **Install Discord Plugin**
   - Need to run plugin installer
   - Check npm registry for `@openclaw/plugin-discord`

2. **Install WhatsApp Plugin**
   - Same as Discord

3. **Install Google Antigravity Auth Plugin**
   - For OAuth flow

4. **Install Whisper CLI**
   - For Spanish audio transcription
   - Check installation method (pip/brew/apt)

5. **Install goplaces CLI**
   - Via Homebrew: `brew install steipete/tap/goplaces`
   - Or find Linux alternative

6. **Re-pair Channels**
   - WhatsApp QR code
   - Discord token validation
   - Google OAuth flow

---

Next: Find plugin installation command and install missing plugins.
