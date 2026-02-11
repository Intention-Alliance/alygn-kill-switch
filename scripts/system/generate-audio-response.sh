#!/bin/bash
# Generate audio response for WhatsApp (WoW Gnome style)
# Usage: ./generate-audio-response.sh "Your message text"

set -e

TEXT="$1"
if [ -z "$TEXT" ]; then
    echo "Usage: $0 \"Your message text\""
    exit 1
fi

OUTPUT_FILE="${2:-/tmp/wooblus-audio-$(date +%s).ogg}"

export ELEVENLABS_API_KEY="sk_7f57cffd5f0cff8c4810b554c69d1e8ecb2de9d7814ca389"

echo "🔧 Generating gnome audio: $TEXT"

# Step 1: Generate MP3 with sag (Antoni voice, WoW Gnome style)
TMP_MP3="/tmp/wooblus-tts-$$.mp3"
sag -v ErXwobaYiN019PkySvjV \
    -o "$TMP_MP3" \
    --speed 1.35 \
    --stability 0 \
    --style 0.9 \
    "$TEXT"

# Step 2: Pitch shift +20% for nasal gnome quality, then convert to Opus OGG for WhatsApp
ffmpeg -i "$TMP_MP3" \
    -af "asetrate=44100*1.2,aresample=44100,atempo=1/1.2" \
    -c:a libopus \
    -b:a 128k \
    -vbr on \
    -compression_level 10 \
    -application voip \
    -ar 48000 \
    -ac 1 \
    "$OUTPUT_FILE" \
    -y \
    2>&1 | tail -3

rm "$TMP_MP3"

echo "✅ Gnomish audio generated: $OUTPUT_FILE ($(du -h "$OUTPUT_FILE" | cut -f1))"
