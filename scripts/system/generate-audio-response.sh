#!/bin/bash
# Generate audio response for WhatsApp (Local TTS)
# Usage: ./generate-audio-response.sh "Your message text"

set -e

TEXT="$1"
if [ -z "$TEXT" ]; then
    echo "Usage: $0 \"Your message text\""
    exit 1
fi

OUTPUT_FILE="${2:-/tmp/wooblus-audio-$(date +%s).ogg}"

echo "🔧 Generating audio with local TTS: $TEXT"

# Use local TTS wrapper (Piper-based)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/local-tts.sh" "$TEXT" "$OUTPUT_FILE" "fast"

echo "✅ Audio generated: $OUTPUT_FILE ($(du -h "$OUTPUT_FILE" | cut -f1))"
