#!/bin/bash
# Wobblus Audio Stitch - Use reference samples for short responses
# Location: scripts/system/wobblus-audio-stitch.sh
#
# Usage:
#   ./wobblus-audio-stitch.sh "greeting" output.ogg
#   ./wobblus-audio-stitch.sh "woohoo" output.ogg
#   ./wobblus-audio-stitch.sh "custom" output.ogg "path/to/custom.wav"
#
# Available samples:
#   - greeting: salutacion-es.ogg (Spanish greeting)
#   - greding: greding-es.ogg (Gnome greeting)
#   - woohoo: woohoo-en.ogg (Exclamation)
#   - angry: GnomeMalePissed05.ogg (Angry gnome)

set -euo pipefail

SAMPLE_TYPE="${1:-greeting}"
OUTPUT="${2:-output.ogg}"
CUSTOM_INPUT="${3:-}"

# Reference samples location
REF_DIR="$HOME/wooblus-voice-refs"

# Available samples
declare -A SAMPLES=(
  ["greeting"]="salutacion-es.ogg"
  ["greding"]="greding-es.ogg"
  ["woohoo"]="woohoo-en.ogg"
  ["angry"]="GnomeMalePissed05.ogg"
)

# Select sample
if [[ "$SAMPLE_TYPE" == "custom" && -n "$CUSTOM_INPUT" ]]; then
  SELECTED_SAMPLE="$CUSTOM_INPUT"
elif [[ -v SAMPLES["$SAMPLE_TYPE"] ]]; then
  SELECTED_SAMPLE="$REF_DIR/${SAMPLES[$SAMPLE_TYPE]}"
else
  echo "❌ Unknown sample type: $SAMPLE_TYPE" >&2
  echo "Available: ${!SAMPLES[*]}" >&2
  exit 1
fi

# Verify file exists
if [[ ! -f "$SELECTED_SAMPLE" ]]; then
  echo "❌ Sample not found: $SELECTED_SAMPLE" >&2
  exit 1
fi

# Convert to WhatsApp-compatible format (Opus in OGG container)
echo "🔧 Using sample: $SELECTED_SAMPLE" >&2
ffmpeg -i "$SELECTED_SAMPLE" \
  -c:a libopus \
  -b:a 48k \
  -vbr on \
  -application audio \
  -y "$OUTPUT" 2>/dev/null

echo "✅ Audio generated: $OUTPUT" >&2
ls -lh "$OUTPUT" >&2
