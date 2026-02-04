# TOOLS.md - Local Notes & Setup

## Audio Processing (Speech-to-Text & Text-to-Speech)

### Whisper CLI (Speech-to-Text)
**Status:** ✅ Installed and working (`/home/andlersrv/.local/bin/whisper`)  
**Version:** 20250625  
**Purpose:** Local audio transcription for Spanish (configured in OpenClaw config)  
**Tested:** Successfully transcribed Spanish audio from WhatsApp  
**Config:**
```json
{
  "tools": {
    "media": {
      "audio": {
        "enabled": true,
        "maxBytes": 20971520,
        "models": [{
          "type": "cli",
          "command": "whisper",
          "args": ["--model", "base", "--language", "Spanish", "{{MediaPath}}"],
          "timeoutSeconds": 45
        }]
      }
    }
  }
}
```

### SAG CLI (Text-to-Speech)
**Status:** ✅ Installed and working (`/home/andlersrv/.local/bin/sag`)  
**Version:** 0.2.2  
**Purpose:** ElevenLabs TTS with streaming to speakers or file output  
**API Key:** Configured in `skills.entries.sag.apiKey` (limited permissions - TTS only, no voice listing)  
**Environment:** 
```bash
export ELEVENLABS_API_KEY="sk_7f57cffd5f0cff8c4810b554c69d1e8ecb2de9d7814ca389"
```

**⚠️ Important:** This API key has limited permissions (TTS only). When using sag, **always specify a voice ID** with `-v` flag.

**Default voice for Wobblus:** `ErXwobaYiN019PkySvjV` (Antoni - well-rounded male)
**Voice direction:** WoW Gnome style - quirky, enthusiastic, slightly mischievous

**Usage examples:**
```bash
# ⚠️ Always specify voice ID (API key can't list voices)

# RECOMMENDED: Use optimized script (fast profile by default - user preference)
./generate-wobblus-voice.sh "Hello there!" output.ogg

# Or specify profile: fast (default) | balanced (enhanced EQ) | character (MORE gnome!)
./generate-wobblus-voice.sh "Engineering!" output.ogg balanced

# Manual (legacy method - less optimized):
sag -v ErXwobaYiN019PkySvjV --speed 1.35 --stability 0 --style 0.9 "Hello there!" -o input.mp3
ffmpeg -i input.mp3 -af "asetrate=44100*1.2,aresample=16000,atempo=1/1.2" output.ogg
```

**Gnome voice settings (Antoni + Pitch Shift + Processing):**
- **Voice ID:** `ErXwobaYiN019PkySvjV`
- **Speed:** 1.35x (fast, energetic)
- **Stability:** 0 (creative mode - more expressive)
- **Style:** 0.9 (high character personality)
- **Pitch shift:** +20% (fast/balanced) / +25% (character)
- **Default profile:** fast (16kHz, minimal processing, mobile-optimized)
- **Formant EQ:** Only in balanced/character profiles (+2.5dB @ 2.5kHz nasality, +1.5dB @ 4kHz presence)
- **Compression:** Only in balanced/character profiles (gentle/moderate)
- **Sample rate:** 16kHz (fast - default) / 24kHz (balanced/character)
- **Model:** eleven_v3 (most expressive, supports audio tags)

**Voice knobs:**
- `--stability` (0|0.5|1 for v3: Creative/Natural/Robust)
- `--similarity` (0..1: higher = closer to reference voice)
- `--style` (0..1: higher = more stylized)
- `--speaker-boost` (clarity boost)
- `--speed` (0.5–2.0 multiplier)
- `--seed` (0–4294967295 for repeatability)

**Audio tags (v3 only):**
- `[whispers]`, `[shouts]`, `[sings]`
- `[laughs]`, `[sighs]`, `[sarcastic]`, `[excited]`
- `[short pause]`, `[long pause]`

**Models:**
- `eleven_v3` (default) — Most expressive, audio tags
- `eleven_multilingual_v2` — Stable baseline
- `eleven_flash_v2_5` — Ultra-low latency (~75ms), 50% cheaper
- `eleven_turbo_v2_5` — Low latency (~250–300ms), 50% cheaper

---

## Google Places API

### goplaces CLI
**Status:** ✅ Installed and working (`/home/andlersrv/.local/bin/goplaces`)  
**Version:** dev  
**Purpose:** CLI for Google Places API queries  
**API Key:** Configured in `skills.entries.goplaces.apiKey`  
**Environment:**
```bash
export GOOGLE_PLACES_API_KEY="AIzaSyAAf8Oj4vpAGAIeNZRySIoZnt6Crer8UDs"
```

**Usage examples:**
```bash
# Search for places
goplaces search "coffee" --open-now --min-rating 4 --limit 5

# Location bias
goplaces search "pizza" --lat 40.8 --lng -73.9 --radius-m 3000

# Get place details
goplaces details <place_id> --reviews

# JSON output
goplaces search "sushi" --json
```

---

## Channels

### WhatsApp
- **Number:** +50662163355
- **Status:** LINKED (authenticated)
- **Policy:** DM allowlist (only my number)
- **Group policy:** allowlist

### Discord
- **Bot:** @ClawdBot MacMini
- **Token:** Configured
- **Status:** Connected
- **Guild:** andler-develops (annotations enabled)
  - **Guild ID:** `1117841083351711785`
  - **Voice Channel:** "General" (`1117841084064735286`)
  - **Annotations Channel:** "annotations" (`1466532145257255004`)
- **DM Policy:** Pairing (approve via `openclaw pairing approve discord <code>`)

**Voice Channel Coordination:**
- **Use case:** Brainstorming, consulting, idea sharing via voice
- **Workflow:** 
  1. Andler joins voice channel
  2. I monitor activity and provide text-based coordination
  3. Can take notes, look up info, execute tasks during voice sessions
- **Commands:** 
  - Ping when joining: "in voice" or similar
  - I can provide real-time assistance via text while you're in voice
  - Post-session: Can summarize discussions, create action items

**Annotations System:**
- **Purpose:** Capture knowledge from voice sessions and discussions
- **Storage strategy:**
  - Local files in workspace (`knowledge/` directory)
  - Posts to #annotations channel with topic-based threads
  - Update MEMORY.md for significant insights
- **Threading:** Organize annotations by topic using Discord threads

---

## API Keys Reference

All configured in `openclaw.json`:

- **ElevenLabs (SAG/Talk):** `sk_7f57cffd5f0cff8c4810b554c69d1e8ecb2de9d7814ca389`
- **Google Places:** `AIzaSyAAf8Oj4vpAGAIeNZRySIoZnt6Crer8UDs`
- **Google API (nano-banana-pro):** `AIzaSyCxCDgvJeCHvo5nkpXtg6khd9GGs_9iJLw`
- **OpenAI:** `sk-proj-se4COKtLurr...`
- **Binance:** `msBy6NEx1hve...`

---

## Notion

### Notion API
**Status:** ✅ Configured and working  
**API Key:** `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`  
**Version:** 2022-06-28  
**Purpose:** Managing project documentation, databases, and knowledge base  

**Key Workspaces:**
- **Intention Alliance - Central Hub**
  - Page ID: `2f933487-4af6-819f-a5c5-f32ae95088f1`
  - URL: https://www.notion.so/Intention-Alliance-Central-Hub-2f9334874af6819fa5c5f32ae95088f1
  - Contains: Access & Credentials, GitHub Repos, Platforms & Tools, Team & Roles, Admin Info
  - **Reference Documents:**
    - "Humanizing Technology - Protocol Overview" (`2f933487-4af6-8158-91a6-c98893b5024c`)
    - "Context Engineering - Technical Framework" (`2f933487-4af6-81af-b946-c57b61ae2c02`)

**Usage examples:**
```bash
export NOTION_KEY="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"

# Search for pages
curl -X POST "https://api.notion.com/v1/search" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"query": "search term"}'

# Get page content
curl "https://api.notion.com/v1/blocks/{page_id}/children" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28"

# Create page
curl -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{
    "parent": {"page_id": "parent_id"},
    "properties": {
      "title": {"title": [{"text": {"content": "Page Title"}}]}
    }
  }'

# Add content blocks
curl -X PATCH "https://api.notion.com/v1/blocks/{page_id}/children" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{
    "children": [
      {"object": "block", "type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "Text"}}]}}
    ]
  }'
```

---

## Usage Notes

**Audio workflows:**
1. **Receiving audio** (WhatsApp/Discord) → Whisper transcribes → I process text
2. **Sending audio** (upon request) → I generate text → SAG converts to audio → Send via channel
3. **Voice logs:** When you ask for audio instead of text, I'll use SAG to generate spoken responses

**TTS preferences:**
- Preferred voice: **Antoni** (`ErXwobaYiN019PkySvjV`) - well-rounded male
- Voice direction: **WoW Gnome style** - quirky, enthusiastic, slightly mischievous (both EN/ES-LATAM)
- Voice settings: Speed 1.35x, Stability 0 (creative), Style 0.9 (very high character), Speaker Boost enabled
- **Pipeline:** `generate-wobblus-voice.sh` with 3 profiles (**fast is default**):
  - **fast** (default): +20% pitch, minimal processing, 16kHz - mobile-optimized, smallest files
  - **balanced**: +20% pitch, formant EQ, gentle compression, 24kHz - enhanced character
  - **character**: +25% pitch, stronger EQ, phaser, 24kHz - MORE GNOME ENERGY!
- Default model: `eleven_v3` (most expressive)
- Delivery style: Gnome-like personality - excited about tech, playful tone, fast-paced, nasal
- **Output format:** OGG Vorbis (generate script) → convert to Opus or MP3 for WhatsApp compatibility
- Reference samples: Stored in `~/wooblus-voice-refs/` + WoW training set in `~/Downloads/gnome-smaples/`
- **Analysis:** Full audio engineering breakdown in `wobblus-voice-analysis.md`

---

*Updated: 2026-01-30 13:18*
