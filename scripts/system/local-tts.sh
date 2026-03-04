#!/bin/bash
# Local TTS Wrapper - ElevenLabs Antoni (sag) with pitch shift
# Original Wobblus gnome voice pipeline
# Usage: ./local-tts.sh "text" output.ogg [profile]

set -euo pipefail

TEXT="${1:?Missing text argument}"
OUTPUT="${2:-output.ogg}"
PROFILE="${3:-fast}"  # fast|balanced|high-quality

# ElevenLabs Antoni voice ID (verified gnome voice)
VOICE_ID="ErXwobaYiN019PkySvjV"

# Generate MP3 with sag (ElevenLabs)
TMP_MP3=$(mktemp --suffix=.mp3)
trap "rm -f '$TMP_MP3'" EXIT

echo "🎙️  Generating speech with ElevenLabs Antoni..." >&2

# Generate with Antoni - fast, expressive gnome base
sag speak \
  -v "$VOICE_ID" \
  --speed 1.35 \
  --stability 0 \
  --style 0.9 \
  --speaker-boost \
  --model-id eleven_v3 \
  -o "$TMP_MP3" \
  "$TEXT" 2>&1 | grep -v "^$" || true

# Apply audio processing based on profile
# WOBBLUS GNOME VOICE: Key is +20% pitch shift for nasal gnome quality
case "$PROFILE" in
  fast)
    # Fast gnome profile: +20% pitch, 16kHz Vorbis (matches test-fast.ogg reference)
    ffmpeg -i "$TMP_MP3" \
      -af "asetrate=44100*1.2,aresample=16000,atempo=1/1.2,highpass=f=80" \
      -c:a libvorbis -q:a 4 -ar 16000 -ac 1 \
      "$OUTPUT" -y 2>&1 | grep -E "(size=|error)" || true
    ;;
  
  balanced)
    # Balanced gnome: +20% pitch, enhanced EQ, 24kHz
    ffmpeg -i "$TMP_MP3" \
      -af "asetrate=44100*1.2,aresample=24000,atempo=1/1.2,highpass=f=80,equalizer=f=2500:t=h:w=1000:g=2.5,equalizer=f=4000:t=h:w=1500:g=1.5" \
      -c:a libopus -b:a 96k -ar 24000 -ac 1 \
      "$OUTPUT" -y 2>&1 | grep -E "(size=|error)" || true
    ;;
  
  high-quality)
    # High-quality gnome: +20% pitch, full processing, 48kHz Vorbis
    ffmpeg -i "$TMP_MP3" \
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
