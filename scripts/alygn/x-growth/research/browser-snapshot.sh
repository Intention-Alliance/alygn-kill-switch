#!/bin/bash
# Generate browser snapshot for X.com /explore
# Called by Lobster before browser-explore.js

echo "📸 Taking browser snapshot of X.com /explore..."

# Navigate to explore page
openclaw browser open --profile alygn "https://x.com/explore" --target host 2>/dev/null

# Wait for page load
sleep 3

# Take snapshot
openclaw browser snapshot --profile alygn --target host > /tmp/x-explore-snapshot.txt 2>/dev/null

if [ -s /tmp/x-explore-snapshot.txt ]; then
  echo "✅ Snapshot saved: /tmp/x-explore-snapshot.txt ($(wc -l < /tmp/x-explore-snapshot.txt) lines)"
  exit 0
else
  echo "❌ Failed to generate snapshot"
  exit 1
fi