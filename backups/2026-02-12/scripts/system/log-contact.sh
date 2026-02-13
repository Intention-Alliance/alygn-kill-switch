#!/bin/bash
# Manual contact interaction tracker
# Usage: ./log-contact.sh <contact_name> [note]

CONTACTS_DIR="$HOME/.openclaw/workspace/contact-tracking"
LOG_FILE="$CONTACTS_DIR/interactions.jsonl"

mkdir -p "$CONTACTS_DIR"

CONTACT_NAME="$1"
NOTE="${2:-}"

if [[ -z "$CONTACT_NAME" ]]; then
    echo "Usage: $0 <contact_name> [note]"
    echo "Example: $0 jacobo 'Discussed project timeline'"
    exit 1
fi

# Normalize contact name (lowercase, no spaces)
CONTACT_NAME=$(echo "$CONTACT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')

TIMESTAMP=$(date -Iseconds)
UNIX_TIME=$(date +%s)

# Create JSON log entry
LOG_ENTRY=$(jq -n \
    --arg contact "$CONTACT_NAME" \
    --arg time "$TIMESTAMP" \
    --arg unix "$UNIX_TIME" \
    --arg note "$NOTE" \
    '{
        contact: $contact,
        timestamp: $time,
        unix_time: ($unix | tonumber),
        note: $note
    }')

# Append to log file
echo "$LOG_ENTRY" >> "$LOG_FILE"

echo "✅ Logged interaction with $CONTACT_NAME at $TIMESTAMP"
if [[ -n "$NOTE" ]]; then
    echo "   Note: $NOTE"
fi
