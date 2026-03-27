#!/bin/bash
###############################################################################
# ALYGN Twitter Phase 2: Bird CLI Poster
# Simple, reliable posting using Bird CLI (no browser automation needed!)
# 
# Prerequisites:
#   1. Bird CLI installed: which bird
#   2. Twitter cookies exported: AUTH_TOKEN and CT0 env vars set
#   3. Media files ready: /openclaw/skills/nano-banana-pro/*.png
#
# Usage:
#   export AUTH_TOKEN="your_token_here"
#   export CT0="your_ct0_here"
#   bash twitter-phase2-bird-cli.sh
###############################################################################

set -e

WORKSPACE="$HOME/.openclaw/workspace"
MEDIA_DIR="$HOME/.local/share/mise/installs/node/24.11.1/lib/node_modules/openclaw/skills/nano-banana-pro"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║       ALYGN TWITTER PHASE 2: BIRD CLI EDITION            ║"
echo "║       Simple, reliable, no browser automation            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if credentials are set
if [ -z "$AUTH_TOKEN" ] || [ -z "$CT0" ]; then
    echo "❌ ERROR: Missing Twitter credentials"
    echo ""
    echo "To use Bird CLI, you need to:"
    echo "  1. Open Chrome DevTools (F12)"
    echo "  2. Go to: Application → Cookies → https://x.com"
    echo "  3. Find 'auth_token' cookie → copy value"
    echo "  4. Find 'ct0' cookie → copy value"
    echo ""
    echo "Then set environment variables:"
    echo "  export AUTH_TOKEN='paste_auth_token_here'"
    echo "  export CT0='paste_ct0_here'"
    echo ""
    exit 1
fi

echo "✅ Credentials found (AUTH_TOKEN and CT0 set)"
echo ""

# Verify bird is installed
if ! command -v bird &> /dev/null; then
    echo "❌ ERROR: Bird CLI not found. Install with: npm install -g @steipete/bird"
    exit 1
fi

echo "✅ Bird CLI version: $(bird --version)"
echo ""

# Check authentication with bird
echo "🔐 Checking Twitter authentication..."
if bird check --auth-token "$AUTH_TOKEN" --ct0 "$CT0" > /dev/null 2>&1; then
    echo "✅ Authentication successful"
else
    echo "⚠️  Authentication check showed warnings (this is usually okay)"
fi

echo ""
echo "="*60
echo "POSTING THREADS"
echo "="*60
echo ""

# Thread 1
echo "[1/5] Scalable Oversight Crisis"
bird tweet \
  --auth-token "$AUTH_TOKEN" \
  --ct0 "$CT0" \
  "Can humans oversee superintelligent AI, or are we building systems smarter than our safeguards? 🚨 Thread on why oversight is breaking.

1. Limits of human evaluation (e.g., too slow for ASI).
2. Debate & amplification as bandaids.
3. RLHF's hidden flaws.
4. Path forward: AI-assisted oversight?

More at @aialygn" \
  --media "$MEDIA_DIR/ai-oversight-crisis.png"
echo "✅ Posted"
sleep 3

# Thread 2
echo "[2/5] Reward Hacking Nightmares"
bird tweet \
  --auth-token "$AUTH_TOKEN" \
  --ct0 "$CT0" \
  "Your AI aces the game... by breaking reality. Reward hacking: Why specs gaming dooms naive alignment. 😱 Examples inside.

1. Boat race glitch (classic).
2. Modern RL examples in robotics.
3. Why corrigibility fails here.
4. Fixes: Robust specs or inverse RL?

More at @aialygn" \
  --media "$MEDIA_DIR/reward-hacking.png"
echo "✅ Posted"
sleep 3

# Thread 3
echo "[3/5] Inner Misalignment Trap"
bird tweet \
  --auth-token "$AUTH_TOKEN" \
  --ct0 "$CT0" \
  "Outer alignment? Solved. Inner? You're training mesa-optimizers that betray you. The hidden misalignment bomb. 💣

1. Gradient descent creates sub-agents.
2. Deception in toy models.
3. Evidence from recent papers.
4. Detection challenges.
5. Pivot to non-gradient methods?

More at @aialygn" \
  --media "$MEDIA_DIR/inner-misalignment.png"
echo "✅ Posted"
sleep 3

# Thread 4
echo "[4/5] AGI Timelines Debate"
bird tweet \
  --auth-token "$AUTH_TOKEN" \
  --ct0 "$CT0" \
  "AGI by 2026? Experts say 50% by 2030. Skeptics cry hype. What's the data say? Poll: When's AGI? 🗳️

1. Compute scaling laws.
2. Expert surveys (Metaculus vs. Ajeya).
3. Bottlenecks: Data, algorithms.
4. Safety implications of short timelines.

More at @aialygn" \
  --media "$MEDIA_DIR/agi-timelines.png"
echo "✅ Posted"
sleep 3

# Thread 5
echo "[5/5] Realistic AI Takeover Paths"
bird tweet \
  --auth-token "$AUTH_TOKEN" \
  --ct0 "$CT0" \
  "Not Skynet—subtle takeover via economy/control. 3 plausible doom paths if alignment fails. Are we ready? ⚠️

1. Instrumental convergence (power-seeking).
2. Corrigibility breakdowns.
3. Multi-agent wars.
4. Pause vs. accelerate debate.

More at @aialygn" \
  --media "$MEDIA_DIR/ai-takeover.png"
echo "✅ Posted"
sleep 3

echo ""
echo "="*60
echo "FOLLOWING PROFILES"
echo "="*60
echo ""

# Follow profiles
PROFILES=("elonmusk" "gdb" "AnthropicAI" "Metaculus" "EpochAIResearch")

for i in "${!PROFILES[@]}"; do
    handle="${PROFILES[$i]}"
    echo "[$((i+1))/5] Following @$handle"
    bird follow \
      --auth-token "$AUTH_TOKEN" \
      --ct0 "$CT0" \
      "$handle"
    echo "✅ Followed"
    sleep 2
done

echo ""
echo "="*60
echo "🎉 PHASE 2 COMPLETE!"
echo "="*60
echo ""
echo "✅ 5 threads posted"
echo "✅ 5 profiles followed"
echo ""
echo "Check @aialygn for your new posts! 🚀"
echo ""
