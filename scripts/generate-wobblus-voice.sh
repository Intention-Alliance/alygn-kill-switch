#!/bin/bash
# Wobblus Voice Generator - Optimized Pipeline v2.0

set -euo pipefail

TEXT="${1:?Missing text argument}"
OUTPUT="${2:-output.ogg}"
PROFILE="${3:-fast}"  # fast|balanced|character (fast is default per user preference)

case "$PROFILE" in
  balanced)
    FILTER="\
      asetrate=44100*1.2,\
      aresample=24000,\
      atempo=1/1.2,\
      equalizer=f=2500:t=h:w=1000:g=2.5,\
      equalizer=f=4000:t=h:w=1500:g=1.5,\
      acompressor=threshold=-18dB:ratio=2.5:attack=5:release=50,\
      volume=1.5dB,\
      highpass=f=80"
    ;;
  character)
    FILTER="\
      asetrate=44100*1.25,\
      aresample=24000,\
      atempo=1/1.25,\
      equalizer=f=2500:t=h:w=800:g=4,\
      equalizer=f=4000:t=h:w=1200:g=3,\
      aphaser=in_gain=0.4:out_gain=0.9:delay=0.8:decay=0.4:speed=0.5,\
      acompressor=threshold=-16dB:ratio=3.5:attack=3:release=40,\
      volume=2.5dB,\
      highpass=f=100"
    ;;
  fast)
    FILTER="\
      asetrate=44100*1.2,\
      aresample=16000,\
      atempo=1/1.2,\
      highpass=f=80"
    ;;
  *)
    echo "Unknown profile: $PROFILE" >&2
    exit 1
    ;;
esac

# Generate base audio
TMP_MP3=$(mktemp --suffix=.mp3)
trap "rm -f '$TMP_MP3'" EXIT

sag -v ErXwobaYiN019PkySvjV \
  --speed 1.35 \
  --stability 0 \
  --style 0.9 \
  --speaker-boost \
  "$TEXT" -o "$TMP_MP3"

# Apply gnome transformation
ffmpeg -i "$TMP_MP3" -af "$FILTER" -q:a 4 "$OUTPUT" -y 2>&1 | grep -E "(size=|error)" || true

echo "✅ Wobblus voice generated: $OUTPUT ($PROFILE profile)"
ls -lh "$OUTPUT"
ffprobe -v error -show_entries format=duration,size:stream=sample_rate -of json "$OUTPUT" | jq -r '.format | "Duration: \(.duration)s | Size: \(.size) bytes"'
