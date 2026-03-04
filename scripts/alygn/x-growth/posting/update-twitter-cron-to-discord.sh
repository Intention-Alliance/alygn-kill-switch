#!/bin/bash

# Update Twitter Automation cron job to deliver to Discord instead of WhatsApp
# Thread: "Alygn: X/Twitter Growth Engagement" in #annotations

echo "🔧 Updating ALYGN Twitter cron job delivery channel..."
echo ""

JOB_ID="10e71511-a7ae-47e1-8293-43c1d3684512"
THREAD_ID="1470977688368840928"

echo "Job ID: $JOB_ID"
echo "Discord Thread: $THREAD_ID (#annotations)"
echo ""

# Update via OpenClaw CLI
openclaw cron update "$JOB_ID" --patch '{
  "description": "Dual system: Generate original posts via Grok + Discover/engage with AI safety community. Reports to Discord #annotations thread. Target: 5 posts + 2-5 engagements/day",
  "payload": {
    "channel": "discord",
    "to": "'"$THREAD_ID"'"
  }
}'

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Cron job updated successfully!"
    echo "   Reports will now go to Discord #annotations thread"
    echo "   Thread: 'Alygn: X/Twitter Growth Engagement'"
else
    echo ""
    echo "❌ Update failed. Try manually:"
    echo "   openclaw cron update $JOB_ID --patch '{\"payload\":{\"channel\":\"discord\",\"to\":\"$THREAD_ID\"}}'"
fi
