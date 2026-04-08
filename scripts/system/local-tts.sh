#!/bin/bash
# Local TTS Wrapper - Piper TTS with gnome pitch shift
# Updated: 2026-03-28 - Added bilingual support (EN/ES) with Ryan/Spanish voices
# Usage: ./local-tts.sh "text" output.ogg [profile] [language]

set -euo pipefail

TEXT="${1:?Missing text argument}"
OUTPUT="${2:-output.ogg}"
PROFILE="${3:-fast}"  # fast|balanced|high-quality
LANGUAGE="${4:-en}"   # en|es

# Piper paths
PIPER_BIN="$HOME/.local/share/piper-tts-env/bin/piper"

# Voice selection based on language
case "$LANGUAGE" in
  en|EN|english|English)
    # English: Ryan (selected voice)
    VOICE_MODEL="$HOME/piper/voices-male/en_US-ryan-medium.onnx"
    PITCH="1.20"  # +20% pitch
    EQ_GAIN_2500="2"
    EQ_GAIN_4000="1"
    ;;
  es|ES|spanish|Spanish)
    # Spanish: Davefx (male Spanish voice)
    VOICE_MODEL="$HOME/piper/voices-es/es_ES-davefx-medium.onnx"
    PITCH="1.15"  # +15% pitch (less aggressive for Spanish)
    EQ_GAIN_2500="2"
    EQ_GAIN_4000="1"
    ;;
  *)
    echo "❌ Unsupported language: $LANGUAGE" >&2
    echo "   Supported: en|es" >&2
    exit 1
    ;;
esac

# Check if voice exists
if [ ! -f "$VOICE_MODEL" ]; then
  echo "⚠️  Voice model not found: $VOICE_MODEL" >&2
  echo "   Please download voice first" >&2
  exit 1
fi

# Generate WAV with Piper
TMP_WAV=$(mktemp --suffix=.wav)
trap "rm -f '$TMP_WAV'" EXIT

echo "🎙️  Generating speech with Piper TTS ($LANGUAGE)..." >&2

"$PIPER_BIN" -m "$VOICE_MODEL" --output_file "$TMP_WAV" <<< "$TEXT"

# Get sample rate
SAMPLE_RATE=$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "$TMP_WAV" 2>/dev/null || echo "22050")
echo "📊 Input: ${SAMPLE_RATE} Hz, Language: $LANGUAGE" >&2

# Apply audio processing based on profile
case "$PROFILE" in
  fast)
    ffmpeg -i "$TMP_WAV" \
      -af "asetrate=${SAMPLE_RATE}*${PITCH},atempo=1/${PITCH},aresample=16000,highpass=f=80,equalizer=f=2500:t=h:w=1000:g=${EQ_GAIN_2500},equalizer=f=4000:t=h:w=1500:g=${EQ_GAIN_4000},volume=1.5" \
      -c:a libopus -b:a 24k -ar 16000 -ac 1 \
      "$OUTPUT" -y 2>&1 | tail -3 >&2
    ;;

  balanced)
    ffmpeg -i "$TMP_WAV" \
      -af "asetrate=${SAMPLE_RATE}*${PITCH},atempo=1/${PITCH},aresample=24000,highpass=f=80,equalizer=f=2500:t=h:w=1000:g=${EQ_GAIN_2500},equalizer=f=4000:t=h:w=1500:g=${EQ_GAIN_4000},volume=2dB" \
      -c:a libopus -b:a 48k -ar 24000 -ac 1 \
      "$OUTPUT" -y 2>&1 | tail -3 >&2
    ;;

  high-quality)
    ffmpeg -i "$TMP_WAV" \
      -af "asetrate=${SAMPLE_RATE}*${PITCH},atempo=1/${PITCH},aresample=48000,highpass=f=80,equalizer=f=2500:t=h:w=1000:g=${EQ_GAIN_2500},equalizer=f=4000:t=h:w=1500:g=${EQ_GAIN_4000},acompressor=threshold=-18dB:ratio=2.5:attack=5:release=50,volume=2.5dB" \
      -c:a libopus -b:a 96k -ar 48000 -ac 1 \
      "$OUTPUT" -y 2>&1 | tail -3 >&2
    ;;

  *)
    echo "❌ Unknown profile: $PROFILE" >&2
    echo "   Valid: fast|balanced|high-quality" >&2
    exit 1
    ;;
esac

# Verify output
if [ ! -f "$OUTPUT" ] || [ ! -s "$OUTPUT" ]; then
  echo "❌ Failed to generate audio" >&2
  exit 1
fi

echo "✅ Audio generated: $OUTPUT ($LANGUAGE, $PROFILE, $(du -h "$OUTPUT" | cut -f1))" >&2
