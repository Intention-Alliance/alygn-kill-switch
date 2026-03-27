#!/bin/bash
# Local TTS Wrapper - Piper TTS with gnome pitch shift
# Updated: 2026-03-15 (ElevenLabs discontinued)
# Usage: ./local-tts.sh "text" output.ogg [profile]

set -euo pipefail

TEXT="${1:?Missing text argument}"
OUTPUT="${2:-output.ogg}"
PROFILE="${3:-fast}"  # fast|balanced|high-quality

# Piper path (virtual environment - ALWAYS use this one)
PIPER_BIN="$HOME/.local/share/piper-tts-env/bin/piper"

# Check if Piper is available in the venv
if [ ! -f "$PIPER_BIN" ]; then
  echo "⚠️  Piper not installed - falling back to reference samples" >&2
  echo "   Install: https://github.com/rhasspy/piper" >&2
  # Fallback: use reference sample for short texts
  if [ ${#TEXT} -lt 50 ]; then
    cp $HOME/wooblus-voice-refs/woohoo-en.ogg "$OUTPUT"
    echo "✅ Used reference sample: $OUTPUT" >&2
    exit 0
  else
    echo "❌ Text too long for reference sample fallback" >&2
    exit 1
  fi
fi

# ALWAYS use the virtual environment piper (the mise one is broken)
PIPER_CMD="$PIPER_BIN"

# Generate WAV with Piper
TMP_WAV=$(mktemp --suffix=.wav)
trap "rm -f '$TMP_WAV'" EXIT

echo "🎙️  Generating speech with Piper TTS..." >&2

# Generate with Piper - use en_US-lessac or similar voice
"$PIPER_CMD" -m $HOME/piper/voices/en_US-lessac-medium.onnx --output_file "$TMP_WAV" <<< "$TEXT"

# Apply audio processing based on profile
# WOBBLUS GNOME VOICE: Key is +20% pitch shift for nasal gnome quality
case "$PROFILE" in
  fast)
    # Fast gnome profile: +20% pitch, 16kHz Vorbis (matches test-fast.ogg reference)
    ffmpeg -i "$TMP_WAV" \
      -af "asetrate=44100*1.2,aresample=16000,atempo=1/1.2,highpass=f=80" \
      -c:a libvorbis -q:a 4 -ar 16000 -ac 1 \
      "$OUTPUT" -y 2>&1 | grep -E "(size=|error)" || true
    ;;
  
  balanced)
    # Balanced gnome: +20% pitch, enhanced EQ, 24kHz
    ffmpeg -i "$TMP_WAV" \
      -af "asetrate=44100*1.2,aresample=24000,atempo=1/1.2,highpass=f=80,equalizer=f=2500:t=h:w=1000:g=2.5,equalizer=f=4000:t=h:w=1500:g=1.5" \
      -c:a libopus -b:a 96k -ar 24000 -ac 1 \
      "$OUTPUT" -y 2>&1 | grep -E "(size=|error)" || true
    ;;
  
  high-quality)
    # High-quality gnome: +20% pitch, full processing, 48kHz Vorbis
    ffmpeg -i "$TMP_WAV" \
      -af "asetrate=44100*1.2,aresample=48000,atempo=1/1.2,highpass=f=80,equalizer=f=2500:t=h:w=1000:g=3,equalizer=f=4000:t=h:w=1500:g=2,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=50" \
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
