# TOOLS.md - Local Notes & Setup

## Audio Processing

### Whisper CLI (Speech-to-Text)

- **Installed:** `$HOME/.local/bin/whisper` (v20250625)
- **Purpose:** Spanish audio transcription (WhatsApp tested)
- **Config:** See below for OpenClaw JSON snippet

```json
{
  "tools": {
    "media": {
      "audio": {
        "enabled": true,
        "maxBytes": 20971520,
        "models": [
          {
            "type": "cli",
            "command": "whisper",
            "args": [
              "--model",
              "base",
              "--language",
              "Spanish",
              "{{MediaPath}}"
            ],
            "timeoutSeconds": 45
          }
        ]
      }
    }
  }
}
```

### Piper TTS (Text-to-Speech) - ✅ INSTALLED

- **Status:** Installed and working
- **Location:** `$HOME/.local/share/piper-tts-env/bin/piper`
- **Voice Model:** `en_US-lessac-medium` (downloaded to `$HOME/piper/voices/`)
- **Scripts:**
  - `scripts/system/local-tts.sh` - Main TTS wrapper with gnome pitch shift
  - `scripts/system/generate-wobblus-voice.sh` - Convenience wrapper
- **Reference samples:** `$HOME/wooblus-voice-refs/` for short responses

---

### Wobblus Voice Samples (Reference Audio)

**Location:** `$HOME/wooblus-voice-refs/`

**Available samples:**

- `woohoo-en.ogg` - "Woohoo!" exclamation (69KB, 22kHz Vorbis)
- `salutacion-es.ogg` - Spanish greeting (8KB, 22kHz AAC)
- `greding-es.ogg` - "¡Greding!" gnome greeting (10KB, 22kHz AAC)
- `GnomeMalePissed05.ogg` - Angry gnome sounds (78KB, 22kHz Vorbis)

**Usage:** For short responses, use these samples directly or stitch together with `scripts/system/wobblus-audio-stitch.sh`

**Voice characteristics:**

- Pitch: High (gnome-like, nasal quality)
- Sample rate: 22.05 kHz
- Format: OGG Vorbis / AAC
- Character: WoW Gnome engineer (quirky, enthusiastic)

---

### Audio Generation Pipeline (Current)

**For new audio generation:**

1. **Short phrases:** Use reference samples from `$HOME/wooblus-voice-refs/`
2. **Long content:** Use `scripts/system/local-tts.sh` (Piper TTS) + pitch shift
3. **WhatsApp:** Convert to Opus or MP3 (Vorbis doesn't play)

**Script:** `scripts/system/generate-wobblus-voice.sh`

- Default profile: `fast` (16kHz, minimal processing)
- Other profiles: `balanced`, `character` (more gnome processing)

---

## File Organization Patterns

### Internal Scripts Management

**For Repository Scripts (e.g., andler-ops):**
```
repo-root/
├── .gitignore              # Ignore: batch-scripts/*, docs/samples/*
├── batch-scripts/          # Internal dev scripts (gitignored)
│   ├── COMPLETE-*.sh
│   └── DEPLOY-*.sh
├── docs/                   # Operation summaries (no sensitive data)
│   ├── FINAL-COMPLETION-125-ISSUES.md
│   ├── DEPLOYMENT-README.md
│   └── samples/            # Safe-to-share examples
└── src/                    # Main repo code
```

**Gitignore Patterns:**
```gitignore
# Internal development scripts
batch-scripts/*
!batch-scripts/.gitkeep

# Generated docs with sensitive data
*-with-secrets.md
.env.local

# Temporary files
*.tmp
*.log
```

**Documentation Strategy:**
- Keep operation summaries in `docs/` (sanitized, no API keys)
- Move sensitive samples to `docs/samples/` after scrubbing
- Internal scripts live in `batch-scripts/` (not committed)

---

## Google Places API

### goplaces CLI

- **Installed:** `$HOME/.local/bin/goplaces`
- **API Key:** Set in `skills.entries.goplaces.apiKey`
- **Usage:** Search, location bias, details, JSON output

---

## Browser Relay

- **Timeouts:** Default 10s, navigation 30s, snapshot 20s, actions 40s, cron 3600s
- **Profile:** `alygn` (Twitter/X, authenticated)
- **Usage:** `browser --profile="alygn" [action] --target host`

---

## Channels

### WhatsApp

- **Number:** +50662163355 (LINKED, DM allowlist)

### Discord

- **Bot:** @Wobblus (connected)
- **Guild:** andler-develops (`1117841083351711785`)
- **Voice Channel:** "General" (`1117841084064735286`)
- **Annotations:** "annotations" (`1466532145257255004`)
- **Twitter Thread:** "Alygn: X/Twitter Growth Engagement" (`1470977688368840928`)
- **DM Policy:** Pairing approval

**Voice Coordination:** Join, monitor, assist, summarize, annotate (local + Discord threads)

---

## API Keys Reference

- **ElevenLabs:** `sk_7f57cffd5f0cff8c4810b554c69d1e8ecb2de9d7814ca389`
- **Google Places:** `AIzaSyAAf8Oj4vpAGAIeNZRySIoZnt6Crer8UDs`
- **Google API:** `AIzaSyCxCDgvJeCHvo5nkpXtg6khd9GGs_9iJLw`
- **OpenAI:** `sk-proj-se4COKtLurr...`
- **Binance:** `msBy6NEx1hve...`

---

## Notion

- **API Key:** `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`
- **Workspaces:** Alygn Central Hub, Organizations TODO Lists, Weekly Progress DB
- **Usage:** Search, get/create pages, add blocks (see curl examples)

---

## Usage Notes

- **Audio:** WhatsApp/Discord → Whisper → text; Reference samples → audio → send
- **TTS:** Use reference samples from `$HOME/wooblus-voice-refs/` for short responses
- **Long content:** Use `scripts/system/local-tts.sh` (Piper) with pitch shift
- **WhatsApp:** Convert OGG to Opus/MP3 (Vorbis doesn't play on WhatsApp)
- **Reference:** Samples in `$HOME/wooblus-voice-refs/`, analysis in `./audio/system/wobblus-voice-analysis.md`

**⚠️ IMPORTANT:** Do NOT use `sag` CLI or ElevenLabs - use reference samples or local Piper TTS (`scripts/system/local-tts.sh`) instead.

---

## 🔧 CRITICAL: Code Modification Rules (LEARNED 2026-03-11)

**Rule:** DO NOT change the approach/implementation unless FULLY NECESSARY.

**Why:** On 2026-03-11, changed rate limiting from 25s to 45s → introduced NaN bug → X API blocked account for 24h.

**Before modifying code:**

1. ✅ Identify the EXACT line/variable causing the issue
2. ✅ Change ONLY that specific value/logic
3. ❌ DO NOT refactor unrelated code
4. ❌ DO NOT "improve" what's already working
5. ✅ Test the minimal change before committing

**Examples:**

- ❌ Wrong: "Let's improve the rate limiting architecture"
- ✅ Right: "Change `min_delay_between_threads: 25` to `45`"

**Hashtag duplication issue:** Same hashtags appended twice to each post. Fix by:

- ✅ Pass hashtags as parameter, don't hardcode
- ✅ Dynamic selection based on post content topic
- ❌ Don't append `#AIGovernance #Alygn` to every single post

---

## Google Places API

### goplaces CLI

**Status:** ✅ Installed and working (`/home/andler/.local/bin/goplaces`)  
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

## Browser Relay Configuration

### Extended Timeouts (Updated 2026-02-08)

**For long-running automation tasks:**

- **Default timeout:** 10s
- **Browser navigation:** 30s (for page loads)
- **Browser snapshot:** 20s (for rendering)
- **Browser action execution:** 40s (for complex interactions)
- **Cron timeouts:** 3600s (1 hour for extended runs)

**Usage:**

```bash
browser --action=snapshot --timeoutMs=30000 --profile=alygn --target host
```

### Alygn Profile (Twitter/X Automation)

- **Profile name:** `alygn`
- **Chrome instance:** Separate authenticated session
- **X.com status:** ✅ Fully authenticated
- **Usage:** `browser --profile="alygn" [action] --target host`
- **Note:** Use extended timeouts for complex workflows

---

## Channels

### WhatsApp

- **Number:** +50662163355
- **Status:** LINKED (authenticated)
- **Policy:** DM allowlist (only my number)
- **Group policy:** allowlist

### Discord

- **Bot:** @Wobblus
- **Token:** Configured
- **Status:** Connected
- **Guild:** andler-develops (annotations enabled)
  - **Guild ID:** `1117841083351711785`
  - **Voice Channel:** "General" (`1117841084064735286`)
  - **Annotations Channel:** "annotations" (`1466532145257255004`)
  - **Twitter Thread:** "Alygn: X/Twitter Growth Engagement" (`1470977688368840928`)
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

- **Alygn - Central Hub**
  - Page ID: `2f933487-4af6-819f-a5c5-f32ae95088f1`
  - URL: <https://www.notion.so/Intention-Alliance-Central-Hub-2f9334874af6819fa5c5f32ae95088f1>
  - Contains: Access & Credentials, GitHub Repos, Platforms & Tools, Team & Roles, Admin Info
  - **Reference Documents:**
    - "Humanizing Technology - Protocol Overview" (`2f933487-4af6-8158-91a6-c98893b5024c`)
    - "Context Engineering - Technical Framework" (`2f933487-4af6-81af-b946-c57b61ae2c02`)

- **Organizations TODO Lists** (Page)
  - Page ID: `26a33487-4af6-81a8-b01c-fd1a8a5f8bcb`
  - URL: <https://www.notion.so/Organizations-TODO-Lists-26a334874af681a8b01cfd1a8a5f8bcb>
  - Purpose: Cross-org task tracking
  - **Contains: Weekly Progress** (Database)
    - Database ID: `2fe33487-4af6-8137-868e-e14fd068948c`
    - URL: <https://www.notion.so/2fe334874af68137868ee14fd068948c>
    - Properties: Name, Week (date), Project (ALYGN/Bitcash/Personal), Status, Highlights, Blockers

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
- Reference samples: Stored in `$HOME/wobblus-voice-refs/` + WoW training set in `$HOME/Downloads/gnome-smaples/`
- **Analysis:** Full audio engineering breakdown in `wobblus-voice-analysis.md`

---

## sessions_spawn

Use to create sub-agent workers. Always include:

- agentId: which specialist to spawn
- task: self-contained description with all context
- label: "{feature}-{agent}" naming convention
- runTimeoutSeconds: appropriate timeout (extensive for long-running tasks, shorter for quick calls)
- cleanup: "delete" for fire-and-forget, "keep" for review

## lobster

Use for deterministic multi-step pipelines. Pipeline files live in
workspace/pipelines/. Invoke via lobster tool with the pipeline path.

## sessions_history

Use to read a sub-agent's output after completion. Pass the
childSessionKey returned by sessions_spawn.

## llm-task

Use for quick structured LLM calls (classification, summarization)
that don't need a full sub-agent session. Pass a JSON schema for
validated output.

---

_Updated: 2026-03-17 17:10_
