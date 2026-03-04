#!/bin/bash

# Test Parser & Executor Dry-Run
# Usage: ./test-parser-dry-run.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$HOME/.openclaw/workspace/twitter-outputs"
TEST_FILE="$OUTPUT_DIR/grok-output-ai-governance-2026.md"

echo "🔧 Testing Twitter Parser & Executor Pipeline"
echo "=============================================="
echo ""
echo "📄 Input file: $TEST_FILE"
echo ""

if [ ! -f "$TEST_FILE" ]; then
    echo "❌ Test file not found: $TEST_FILE"
    exit 1
fi

echo "📝 Running dry-run..."
echo ""

cd "$SCRIPT_DIR/x-twitter"
bun x-api-executor.js "$TEST_FILE" --dry-run

echo ""
echo "✅ Test complete!"
