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

### SAG CLI (Text-to-Speech)

- **Installed:** `/home/andlersrv/.local/bin/sag` (v0.2.2)
- **Purpose:** ElevenLabs TTS (stream/file)
- **API Key:** Set in `skills.entries.sag.apiKey` (TTS only)
- **Voice:** `ErXwobaYiN019PkySvjV` (Antoni, WoW Gnome style)
- **Usage:** Always specify voice ID (`-v`). Use `generate-wobblus-voice.sh` for profiles: fast (default), balanced, character.

**Voice settings:** Speed 1.35x, Stability 0, Style 0.9, Pitch +20–25%, Speaker Boost, Model: eleven_v3  
**Audio tags:** `[whispers]`, `[shouts]`, `[sings]`, etc.  
**Output:** OGG Vorbis (convert for WhatsApp)

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

- **Audio:** WhatsApp/Discord → Whisper → text; SAG → audio → send
- **TTS:** Antoni, WoW Gnome style, fast/balanced character profiles, OGG output
- **Reference:** Samples in `./audio/`, analysis in `./audio/system/wobblus-voice-analysis.md`

_Updated: 2026-02-18 13:18_
