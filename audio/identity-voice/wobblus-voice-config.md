# Wobblus Voice Configuration - FINAL

**Date:** 2026-02-03  
**Decision:** FAST profile selected as default  
**Tested:** WhatsApp (MP3/Opus work, Vorbis doesn't)

---

## ✅ Final Configuration

**Default Profile:** `fast`
- **Sample Rate:** 16kHz (phone quality, optimal for mobile)
- **Pitch Shift:** +20%
- **Processing:** Minimal (pitch shift + highpass filter only)
- **File Size:** Smallest (~35% reduction vs baseline)
- **Quality:** 6.5/10 gnome character (clean, simple, distinctive)

**Why Fast?**
- ✅ User preference (tested and approved)
- ✅ Mobile-optimized (WhatsApp, Signal, Discord)
- ✅ Smallest file sizes (faster delivery)
- ✅ Clean sound (less processing = more natural)
- ✅ Good intelligibility on phone speakers

---

## 🎛️ Usage

**Default (fast profile):**
```bash
./generate-wobblus-voice.sh "Your text here" output.ogg
```

**Other profiles (optional):**
```bash
# Enhanced character with formant EQ
./generate-wobblus-voice.sh "Technical explanation" output.ogg balanced

# Maximum gnome energy
./generate-wobblus-voice.sh "EXCITING NEWS!" output.ogg character
```

---

## 📱 Platform Compatibility

**WhatsApp:**
- ⚠️ OGG Vorbis: Doesn't play (tested)
- ✅ OGG Opus: Works (WhatsApp native)
- ✅ MP3: Works (universal fallback)

**Signal:**
- ✅ OGG Vorbis: Works
- ✅ All formats supported

**Discord:**
- ✅ MP3/OGG: Works
- ⚠️ DM delivery requires different approach (channel plugin limitations)

**Recommendation:** Generate as OGG Vorbis, convert to Opus/MP3 when sending to WhatsApp.

---

## 🔄 Conversion Pipeline

```bash
# Generate base audio (fast profile)
./generate-wobblus-voice.sh "Text" wobblus.ogg

# For WhatsApp: Convert to Opus
ffmpeg -i wobblus.ogg -c:a libopus -b:a 48k -vbr on wobblus-opus.ogg

# Or convert to MP3 (universal)
ffmpeg -i wobblus.ogg -c:a libmp3lame -b:a 96k wobblus.mp3
```

---

## 📊 Profile Comparison

| Metric | Fast (Default) | Balanced | Character |
|--------|---------------|----------|-----------|
| Sample Rate | 16kHz | 24kHz | 24kHz |
| Pitch Shift | +20% | +20% | +25% |
| Formant EQ | No | Yes | Yes (stronger) |
| Compression | No | Gentle | Moderate |
| File Size | Smallest | Medium | Medium |
| Processing | Minimal | Medium | Heavy |
| Gnome Factor | 6.5/10 | 8/10 | 9.5/10 |
| Use Case | Default | Technical/detailed | Storytelling/excited |

---

## 📝 Updated Files

- ✅ `generate-wobblus-voice.sh` - Default changed to "fast"
- ✅ `TOOLS.md` - Documentation updated
- ✅ `wobblus-voice-config.md` - This file (final config record)

---

**Status:** Production ready 🚀  
**Next:** Use fast profile for all Wobblus voice generation by default.
