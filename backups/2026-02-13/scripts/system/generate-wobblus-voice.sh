#!/bin/bash
# Wobblus Voice Generator - Local TTS Pipeline v3.0
# Now uses Piper TTS (local) instead of ElevenLabs API

set -euo pipefail

TEXT="${1:?Missing text argument}"
OUTPUT="${2:-output.ogg}"
PROFILE="${3:-fast}"  # fast|balanced|character (fast is default per user preference)

echo "🔧 Generating Wobblus voice with local TTS..." >&2

# Use local TTS wrapper with appropriate profile mapping
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

case "$PROFILE" in
  character)
    TTS_PROFILE="high-quality"
    ;;
  balanced)
    TTS_PROFILE="balanced"
    ;;
  fast|*)
    TTS_PROFILE="fast"
    ;;
esac

# Generate with local TTS
"$SCRIPT_DIR/local-tts.sh" "$TEXT" "$OUTPUT" "$TTS_PROFILE"

echo "✅ Wobblus voice generated: $OUTPUT ($PROFILE profile)" >&2
ls -lh "$OUTPUT" >&2
