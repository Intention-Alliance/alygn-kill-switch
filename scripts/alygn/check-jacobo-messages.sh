#!/bin/bash
# Script to check for messages with Jacobo in systemd journal

JACOBO_PHONE="50663877142"
STATE_FILE="$HOME/.openclaw/workspace/jacobo-message-tracker.json"
LOOKBACK_HOURS=24

# Initialize state file if it doesn't exist
if [[ ! -f "$STATE_FILE" ]]; then
    echo '{"last_check": 0}' > "$STATE_FILE"
fi

# Get last check timestamp
LAST_CHECK=$(jq -r '.last_check' "$STATE_FILE")
CURRENT_TIME=$(date +%s)

# Search for messages in journalctl since last check
# Baileys logs messages with phone numbers in the format
MESSAGES=$(journalctl -u openclaw-gateway --since="@$LAST_CHECK" --no-pager 2>/dev/null | \
    grep -E "$JACOBO_PHONE|6387.*7142" | \
    grep -iE "message|msg|incoming|outgoing")

if [[ -n "$MESSAGES" ]]; then
    # Found messages
    echo "✅ Mensajes con Jacobo detectados:"
    echo "$MESSAGES"
    
    # Update state
    jq --arg time "$CURRENT_TIME" '.last_check = ($time | tonumber)' "$STATE_FILE" > "$STATE_FILE.tmp"
    mv "$STATE_FILE.tmp" "$STATE_FILE"
    
    exit 0
else
    # No messages found
    if (( CURRENT_TIME - LAST_CHECK > 86400 )); then
        echo "⚠️ No se detectaron mensajes con Jacobo en las últimas 24h"
        
        # Update state anyway
        jq --arg time "$CURRENT_TIME" '.last_check = ($time | tonumber)' "$STATE_FILE" > "$STATE_FILE.tmp"
        mv "$STATE_FILE.tmp" "$STATE_FILE"
        
        exit 1
    else
        # Not yet 24h, stay quiet
        exit 0
    fi
fi
