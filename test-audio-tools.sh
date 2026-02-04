#!/bin/bash
# Audio Workflow Test Script
# Tests: Audio generation (TTS) and transcription (STT)

set -e

echo "=== Audio Tools Test Suite ==="
echo ""

# Environment
export ELEVENLABS_API_KEY="sk_7f57cffd5f0cff8c4810b554c69d1e8ecb2de9d7814ca389"
export GOOGLE_PLACES_API_KEY="AIzaSyAAf8Oj4vpAGAIeNZRySIoZnt6Crer8UDs"
export PATH="$HOME/.local/bin:$PATH"

# Test 1: goplaces (Google Places API)
echo "1. Testing goplaces..."
if command -v goplaces &> /dev/null; then
    echo "   ✅ goplaces found: $(goplaces --version 2>&1 || echo 'dev')"
    echo "   Testing search..."
    goplaces search "coffee San Jose" --limit 1 2>&1 | head -10
else
    echo "   ❌ goplaces not found"
fi

echo ""

# Test 2: sag (ElevenLabs TTS)
echo "2. Testing sag (Text-to-Speech)..."
if command -v sag &> /dev/null; then
    echo "   ✅ sag found: $(sag --version)"
    echo "   Generating test audio..."
    sag -v 21m00Tcm4TlvDq8ikWAM -o /tmp/test-tts.mp3 "This is a test audio message from Wooblus" 2>&1
    if [ -f /tmp/test-tts.mp3 ]; then
        echo "   ✅ Audio generated: $(ls -lh /tmp/test-tts.mp3 | awk '{print $5}')"
    else
        echo "   ❌ Audio generation failed"
    fi
else
    echo "   ❌ sag not found"
fi

echo ""

# Test 3: whisper (OpenAI Speech-to-Text)
echo "3. Testing whisper (Speech-to-Text)..."
if command -v whisper &> /dev/null; then
    echo "   ✅ whisper found: $(whisper --version 2>&1 | head -1)"
    echo "   Testing transcription..."
    # Use the generated test audio from sag
    if [ -f /tmp/test-tts.mp3 ]; then
        whisper /tmp/test-tts.mp3 --model base --language English --output_dir /tmp 2>&1 | tail -10
        if [ -f /tmp/test-tts.txt ]; then
            echo "   ✅ Transcription result:"
            cat /tmp/test-tts.txt
        fi
    else
        echo "   ⚠️  No test audio file to transcribe"
    fi
else
    echo "   ❌ whisper not found (still installing?)"
fi

echo ""
echo "=== Test Complete ===="
