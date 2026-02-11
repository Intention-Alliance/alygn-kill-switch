#!/bin/bash
# Local TTS Wrapper - Piper-based speech synthesis
# Replaces ElevenLabs API (sag) with local Piper TTS
# Usage: ./local-tts.sh "text" output.ogg [profile]

set -euo pipefail

# Configuration
PIPER_MODEL="${PIPER_MODEL:-$HOME/.local/share/piper-voices/en-us-lessac-high.onnx}"
TEXT="${1:?Missing text argument}"
OUTPUT="${2:-output.ogg}"
PROFILE="${3:-fast}"  # fast|balanced|high-quality

# Check if Piper is installed
if ! command -v piper &> /dev/null; then
    echo "❌ Error: piper not found. Install it first:" >&2
    echo "   yay -S piper-tts" >&2
    echo "   or see scripts/system/local-tts-setup.md" >&2
    exit 1
fi

# Check if model exists
if [ ! -f "$PIPER_MODEL" ]; then
    echo "❌ Error: Piper model not found at $PIPER_MODEL" >&2
    echo "   Download voices: see scripts/system/local-tts-setup.md" >&2
    exit 1
fi

# Generate WAV with Piper
TMP_WAV=$(mktemp --suffix=.wav)
trap "rm -f '$TMP_WAV'" EXIT

echo "🎙️  Generating speech with Piper..." >&2
echo "$TEXT" | piper --model "$PIPER_MODEL" --output_file "$TMP_WAV" 2>&1 | grep -v "^$" || true

# Apply audio processing based on profile
case "$PROFILE" in
  fast)
    # Minimal processing, 16kHz, Opus for WhatsApp
    ffmpeg -i "$TMP_WAV" \
      -af "highpass=f=80" \
      -c:a libopus -b:a 64k -ar 16000 -ac 1 \
      "$OUTPUT" -y 2>&1 | grep -E "(size=|error)" || true
    ;;
  
  balanced)
    # Enhanced EQ, 24kHz, Opus
    ffmpeg -i "$TMP_WAV" \
      -af "highpass=f=80,equalizer=f=2500:t=h:w=1000:g=2,equalizer=f=4000:t=h:w=1500:g=1.5" \
      -c:a libopus -b:a 96k -ar 24000 -ac 1 \
      "$OUTPUT" -y 2>&1 | grep -E "(size=|error)" || true
    ;;
  
  high-quality)
    # Full processing, 48kHz, Vorbis OGG
    ffmpeg -i "$TMP_WAV" \
      -af "highpass=f=80,equalizer=f=2500:t=h:w=1000:g=3,equalizer=f=4000:t=h:w=1500:g=2,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=50" \
      -c:a libvorbis -q:a 6 -ar 48000 \
      "$OUTPUT" -y 2>&1 | grep -E "(size=|error)" || true
    ;;
  
  *)
    echo "❌ Unknown profile: $PROFILE" >&2
    echo "   Valid: fast|balanced|high-quality" >&2
    exit 1
    ;;
esac

echo "✅ Audio generated: $OUTPUT ($PROFILE profile, $(du -h "$OUTPUT" | cut -f1))" >&2
