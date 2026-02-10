#!/bin/bash
# Check last interaction with a contact
# Usage: ./check-contact.sh <contact_name> [max_days]

CONTACTS_DIR="$HOME/.openclaw/workspace/contact-tracking"
LOG_FILE="$CONTACTS_DIR/interactions.jsonl"

CONTACT_NAME="$1"
MAX_DAYS="${2:-1}"  # Default 1 day (24 hours)

if [[ -z "$CONTACT_NAME" ]]; then
    echo "Usage: $0 <contact_name> [max_days]"
    echo "Example: $0 jacobo 1"
    exit 1
fi

# Normalize contact name
CONTACT_NAME=$(echo "$CONTACT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')

if [[ ! -f "$LOG_FILE" ]]; then
    echo "⚠️ No tracking log found. No interactions recorded yet."
    exit 1
fi

CURRENT_TIME=$(date +%s)
MAX_AGE_SECONDS=$((MAX_DAYS * 86400))
CUTOFF_TIME=$((CURRENT_TIME - MAX_AGE_SECONDS))

# Find last interaction
LAST_INTERACTION=$(cat "$LOG_FILE" | \
    jq -r --arg contact "$CONTACT_NAME" --arg cutoff "$CUTOFF_TIME" \
    'select(.contact == $contact and .unix_time >= ($cutoff | tonumber)) | 
     "\(.timestamp)|\(.note)"' | \
    tail -1)

if [[ -n "$LAST_INTERACTION" ]]; then
    TIMESTAMP=$(echo "$LAST_INTERACTION" | cut -d'|' -f1)
    NOTE=$(echo "$LAST_INTERACTION" | cut -d'|' -f2-)
    
    echo "✅ Last interaction with $CONTACT_NAME: $TIMESTAMP"
    if [[ -n "$NOTE" && "$NOTE" != "null" ]]; then
        echo "   Note: $NOTE"
    fi
    exit 0
else
    echo "⚠️ No interaction with $CONTACT_NAME in the last $MAX_DAYS day(s)"
    
    # Check if contact exists at all
    EVER_CONTACTED=$(cat "$LOG_FILE" | jq -r --arg contact "$CONTACT_NAME" 'select(.contact == $contact)' | head -1)
    
    if [[ -z "$EVER_CONTACTED" ]]; then
        echo "   (No interactions ever recorded with this contact)"
    else
        # Show last interaction ever
        LAST_EVER=$(cat "$LOG_FILE" | \
            jq -r --arg contact "$CONTACT_NAME" \
            'select(.contact == $contact) | .timestamp' | \
            tail -1)
        echo "   (Last interaction was on: $LAST_EVER)"
    fi
    
    exit 1
fi
