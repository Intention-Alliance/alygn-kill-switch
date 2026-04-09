#!/bin/bash
# Clean up stale agent sessions
# Usage: cleanup-sessions.sh [days_old] (default: 7)

SESSIONS_DIR="$HOME/.openclaw/agents"
DAYS_OLD=${1:-7}

echo "=========================================="
echo "Agent Session Cleanup"
echo "=========================================="
echo "Sessions directory: $SESSIONS_DIR"
echo "Removing sessions older than: $DAYS_OLD days"
echo ""

# Count before
count_before=$(find "$SESSIONS_DIR" -name "*.jsonl" -type f 2>/dev/null | wc -l)
echo "Total sessions before cleanup: $count_before"

# Find and remove stale sessions (excluding sessions.json and lock files)
stale_sessions=$(find "$SESSIONS_DIR" -name "*.jsonl" -type f -mtime +$DAYS_OLD 2>/dev/null)
stale_count=$(echo "$stale_sessions" | grep -v "sessions.json" | grep -v "\.lock" | wc -l)

echo ""
echo "Removing $stale_count stale sessions..."

if [ -n "$stale_sessions" ]; then
  echo "$stale_sessions" | while read -r file; do
    # Skip sessions.json and lock files
    if [[ "$file" == *"sessions.json" ]] || [[ "$file" == *".lock" ]]; then
      continue
    fi
    echo "  Removing: $file"
    rm -f "$file"
  done
fi

# Count after
count_after=$(find "$SESSIONS_DIR" -name "*.jsonl" -type f 2>/dev/null | wc -l)
removed=$((count_before - count_after))

echo ""
echo "=========================================="
echo "Cleanup complete!"
echo "Sessions removed: $removed"
echo "Remaining sessions: $count_after"
echo "=========================================="
