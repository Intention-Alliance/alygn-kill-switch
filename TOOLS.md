# TOOLS.md - Local Notes & Setup

## Audio Processing

### Whisper CLI (Speech-to-Text)

- **Installed:** `/home/andlersrv/.local/bin/whisper` (v20250625)
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

### SAG CLI (Text-to-Speech) - ❌ REMOVED

- **Status:** ElevenLabs discontinued - DO NOT USE
- **Current approach:** Use local Piper TTS (`scripts/system/local-tts.sh`) + reference samples from `~/wooblus-voice-refs/`

---

### Wobblus Voice Samples (Reference Audio)

**Location:** `~/wooblus-voice-refs/`

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

1. **Short phrases:** Use reference samples from `~/wooblus-voice-refs/`
2. **Long content:** Use `scripts/system/local-tts.sh` (Piper TTS) + pitch shift
3. **WhatsApp:** Convert to Opus or MP3 (Vorbis doesn't play)

**Script:** `scripts/system/generate-wobblus-voice.sh`
- Default profile: `fast` (16kHz, minimal processing)
- Other profiles: `balanced`, `character` (more gnome processing)

---

## Google Places API

### goplaces CLI

- **Installed:** `/home/andlersrv/.local/bin/goplaces`
- **API Key:** Set in `skills.entries.goplaces.apiKey`
- **Usage:** Search, location bias, details, JSON output

---

## Browser Relay

- **Timeouts:** Default 10s, navigation 30s, snapshot 20s, actions 40s, cron 3600s
- **Profile:** `alygn` (Twitter/X, authenticated)
- **Usage:** `browser --profile="alygn" [action]`

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
- **TTS:** Use reference samples from `~/wooblus-voice-refs/` for short responses
- **Long content:** Use `scripts/system/local-tts.sh` (Piper) with pitch shift
- **WhatsApp:** Convert OGG to Opus/MP3 (Vorbis doesn't play on WhatsApp)
- **Reference:** Samples in `~/wooblus-voice-refs/`, analysis in `./audio/system/wobblus-voice-analysis.md`

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

_Updated: 2026-03-11 17:10_
