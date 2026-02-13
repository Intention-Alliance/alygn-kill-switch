#!/bin/bash
# ALYGN VC Discovery Cron Job Setup
# Schedule: Daily at 10 AM
# Created: Feb 12, 2026

SCRIPT_DIR="$HOME/.openclaw/workspace/scripts/alygn/vc-outreach"
SCRIPT="$SCRIPT_DIR/automated-vc-discovery.js"

echo "🔧 Setting up ALYGN VC Discovery cron job..."

# Make scripts executable
chmod +x "$SCRIPT"
echo "✅ Made script executable"

# Add cron job using OpenClaw cron system
echo ""
echo "📅 Adding cron job (Daily at 10 AM)..."

openclaw cron add \
  --name="ALYGN Daily VC Discovery" \
  --schedule="0 10 * * *" \
  --command="node $SCRIPT" \
  --session=isolated \
  --notify=discord \
  --channel="1471206314435809431"

if [ $? -eq 0 ]; then
  echo "✅ Cron job added successfully!"
  echo ""
  echo "📋 Job details:"
  echo "   Name: ALYGN Daily VC Discovery"
  echo "   Schedule: Daily at 10 AM (0 10 * * *)"
  echo "   Script: $SCRIPT"
  echo "   Notifications: Discord (#Alygn: VC Outreach Plan & Implementation)"
  echo ""
  echo "🔍 View all cron jobs:"
  echo "   openclaw cron list"
  echo ""
  echo "▶️  Run manually to test:"
  echo "   node $SCRIPT --dry-run"
  echo ""
else
  echo "❌ Failed to add cron job"
  exit 1
fi
