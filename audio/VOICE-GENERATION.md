# Voice Generation - Local TTS Only

## ⚠️ ElevenLabs Discontinued

**ElevenLabs API is NOT used** (discontinued as of March 2026). All references to ElevenLabs in legacy docs are obsolete.

## Current Voice Pipeline

### For Short Responses (< 30 seconds)
**Use reference samples from `$HOME/wooblus-voice-refs/`:**
- `woohoo-en.ogg` - "Woohoo!" exclamation
- `salutacion-es.ogg` - Spanish greeting
- `greding-es.ogg` - "¡Greding!" gnome greeting
- `GnomeMalePissed05.ogg` - Angry gnome sounds

**Stitch samples:** `scripts/system/wobblus-audio-stitch.sh`

### For Long Content (> 30 seconds)
**Use local Piper TTS:**
```bash
scripts/system/local-tts.sh --text "Your text here" --output /tmp/voice.ogg
```

**Script:** `scripts/system/generate-wobblus-voice.sh`
- Default profile: `fast` (16kHz, minimal processing)
- Other profiles: `balanced`, `character` (more gnome processing)

### WhatsApp Format Conversion
**OGG → Opus/MP3** (Vorbis doesn't play on WhatsApp):
```bash
scripts/system/convert-for-whatsapp.sh /tmp/voice.ogg
```

## Voice Characteristics
- **Pitch:** High (gnome-like, nasal quality)
- **Sample rate:** 22.05 kHz
- **Format:** OGG Vorbis / AAC / Opus
- **Character:** WoW Gnome engineer (quirky, enthusiastic)

## Files to Update

If you find ElevenLabs references in docs/memory files, they are **legacy** and should be updated to reference:
1. Reference samples (`$HOME/wooblus-voice-refs/`)
2. Local Piper TTS (`scripts/system/local-tts.sh`)
3. Voice generation script (`scripts/system/generate-wobblus-voice.sh`)

---
**Updated:** 2026-03-15 (ElevenLabs removal directive from Andler)
