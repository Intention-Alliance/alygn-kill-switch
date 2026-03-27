# WoW Gnome Voice Configuration - FINAL v2

## Voice Selected: Antoni + 20% Pitch Shift

**Selected by:** Andler (2026-01-30 13:53)  
**Finalized:** Antoni with +20% pitch raise  
**Key feature:** Nasal, high-pitched gnome quality ("speaking with the nose")

---

## Reference Samples (Stored)

Located in: `$HOME/wooblus-voice-refs/`

1. **woohoo-en.ogg** - "Woohoo!" (English exclamation)
2. **salutacion-es.ogg** - "Salutación" (Spanish greeting)
3. **greding-es.ogg** - "¡Greding!" (Spanish greeting with gnome accent)
4. **hithere-en.ogg** - "¡Hi there!" (Mixed greeting)

---

## Final Voice Settings

| Parameter       | Value                  | Reason                                        |
| --------------- | ---------------------- | --------------------------------------------- |
| Voice ID        | `ErXwobaYiN019PkySvjV` | Antoni - well-rounded male                    |
| Speed           | 1.35x                  | Fast-paced, energetic gnome speech            |
| Stability       | 0                      | Creative mode (v3), maximum expressiveness    |
| Style           | 0.9                    | Very high character personality               |
| Model           | eleven_v3              | Most expressive, supports audio tags          |
| **Pitch Shift** | **+20%**               | **Creates nasal, high-pitched gnome quality** |

---

## Pitch Shifting Process

The key to gnome voice is **pitch shifting AFTER TTS generation**:

```bash
# 1. Generate with sag
sag -v ErXwobaYiN019PkySvjV --speed 1.35 --stability 0 --style 0.9 -o input.mp3 "Text"

# 2. Pitch shift +20% (raises pitch without changing speed)
ffmpeg -i input.mp3 \
  -af "asetrate=44100*1.2,aresample=44100,atempo=1/1.2" \
  -c:a libopus -b:a 128k output.ogg
```

**Why this works:**

- `asetrate=44100*1.2` - Increases sample rate by 20% (raises pitch)
- `aresample=44100` - Resamples back to original rate
- `atempo=1/1.2` - Adjusts tempo back to normal speed
- Result: Higher pitch, same speed = nasal gnome voice!

---

## Voices Tested (Evolution)

### Round 1: Base voices

1. ❌ Rachel - Female, too professional
2. ✅ Josh - Young male, enthusiastic
3. **✅ Antoni** - Well-rounded male (chosen)
4. ❌ Clyde - Too old/deep

### Round 2: Pitch adjustments (finding nasal quality)

1. Sam + 15% pitch - Good but raspy
2. Josh + 18% pitch - Better but still young
3. **✅ Antoni + 20% pitch** - **PERFECT! Nasal gnome quality**

**Winner:** Antoni + 20% pitch = "Mucho mejor el 3er último"

---

## Usage Examples

### Basic gnome greeting (Spanish)

```bash
./generate-audio-response.sh "¡Woohoo! ¡Saludos!"
```

### English gnome style

```bash
./generate-audio-response.sh "Greetings! Let's get those gears spinning!"
```

### Manual (for custom processing)

```bash
# Generate
sag -v ErXwobaYiN019PkySvjV --speed 1.35 --stability 0 --style 0.9 \
  -o /tmp/voice.mp3 "Your text"

# Pitch shift
ffmpeg -i /tmp/voice.mp3 \
  -af "asetrate=44100*1.2,aresample=44100,atempo=1/1.2" \
  -c:a libopus -b:a 128k /tmp/voice.ogg -y
```

---

## Characteristic Gnome Quality

**Feedback from user:**

- "The voice is a little deep for a gnome" ❌
- "Raise the pitch a little more accurate" ✅
- "Like speaking with the nose" ✅ **← KEY REQUIREMENT**
- "Mucho mejor el 3er último" ✅ (Antoni + 20% pitch)

**Result:** Nasal, high-pitched, fast-paced, enthusiastic gnome voice!

---

## Configuration Files Updated

- ✅ `TOOLS.md` - Voice settings with pitch shift
- ✅ `generate-audio-response.sh` - Includes pitch shifting step
- ✅ `gnome-voice-final-v2.md` - This document
- ✅ Reference samples backed up

---

_Finalized: 2026-01-30 13:53_  
_Voice: Antoni (ErXwobaYiN019PkySvjV) + 20% pitch shift_  
_Style: WoW Gnome - nasal, high-pitched, fast-paced, enthusiastic_
- ✅ Reference samples backed up

---

*Finalized: 2026-01-30 13:53*  
*Voice: Antoni (ErXwobaYiN019PkySvjV) + 20% pitch shift*  
*Style: WoW Gnome - nasal, high-pitched, fast-paced, enthusiastic* 🔧👃
