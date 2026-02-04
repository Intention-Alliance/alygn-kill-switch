#!/bin/bash

# Spotify OAuth authentication flow
# Gets refresh token for persistent access

set -e

echo "🎵 Spotify Authentication Setup"
echo ""

# Check if credentials exist
if [[ -z "$SPOTIFY_CLIENT_ID" ]] && [[ ! -f ~/.openclaw/openclaw.json ]]; then
  echo "❌ Missing SPOTIFY_CLIENT_ID"
  echo ""
  echo "Please set environment variables or add to ~/.openclaw/openclaw.json:"
  echo "  SPOTIFY_CLIENT_ID"
  echo "  SPOTIFY_CLIENT_SECRET"
  exit 1
fi

if [[ -z "$SPOTIFY_CLIENT_SECRET" ]] && [[ ! -f ~/.openclaw/openclaw.json ]]; then
  echo "❌ Missing SPOTIFY_CLIENT_SECRET"
  exit 1
fi

# Load from config if not in env
if [[ -z "$SPOTIFY_CLIENT_ID" ]]; then
  SPOTIFY_CLIENT_ID=$(jq -r '.skills.entries.spotify.clientId // empty' ~/.openclaw/openclaw.json)
  SPOTIFY_CLIENT_SECRET=$(jq -r '.skills.entries.spotify.clientSecret // empty' ~/.openclaw/openclaw.json)
fi

if [[ -z "$SPOTIFY_CLIENT_ID" ]] || [[ -z "$SPOTIFY_CLIENT_SECRET" ]]; then
  echo "❌ Could not find Spotify credentials"
  exit 1
fi

# Required scopes
SCOPES="user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-recently-played user-top-read playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private"

# Authorization URL
AUTH_URL="https://accounts.spotify.com/authorize"
REDIRECT_URI="http://localhost:8888/callback"

# Build authorization URL
SCOPE_ENCODED=$(echo "$SCOPES" | sed 's/ /%20/g')
URL="${AUTH_URL}?client_id=${SPOTIFY_CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&scope=${SCOPE_ENCODED}"

echo "1️⃣  Opening browser for authorization..."
echo ""

# Open browser
if command -v xdg-open &> /dev/null; then
  xdg-open "$URL"
elif command -v open &> /dev/null; then
  open "$URL"
else
  echo "Please open this URL in your browser:"
  echo "$URL"
fi

echo ""
echo "2️⃣  After authorizing, you'll be redirected to:"
echo "   http://localhost:8888/callback?code=..."
echo ""
echo "3️⃣  Copy the ENTIRE URL and paste it here:"
read -r CALLBACK_URL

# Extract authorization code
CODE=$(echo "$CALLBACK_URL" | grep -oP 'code=\K[^&]+' || echo "")

if [[ -z "$CODE" ]]; then
  echo "❌ Could not extract authorization code from URL"
  exit 1
fi

echo ""
echo "4️⃣  Exchanging code for tokens..."

# Exchange code for tokens
RESPONSE=$(curl -s -X POST "https://accounts.spotify.com/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "code=${CODE}" \
  -d "redirect_uri=${REDIRECT_URI}" \
  -d "client_id=${SPOTIFY_CLIENT_ID}" \
  -d "client_secret=${SPOTIFY_CLIENT_SECRET}")

# Extract tokens
ACCESS_TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')
REFRESH_TOKEN=$(echo "$RESPONSE" | jq -r '.refresh_token // empty')

if [[ -z "$REFRESH_TOKEN" ]]; then
  echo "❌ Failed to get refresh token"
  echo "Response: $RESPONSE"
  exit 1
fi

echo "✅ Success!"
echo ""
echo "5️⃣  Add this to your OpenClaw config:"
echo ""
echo '{
  "skills": {
    "entries": {
      "spotify": {
        "clientId": "'"$SPOTIFY_CLIENT_ID"'",
        "clientSecret": "'"$SPOTIFY_CLIENT_SECRET"'",
        "refreshToken": "'"$REFRESH_TOKEN"'"
      }
    }
  }
}'
echo ""
echo "Or set environment variable:"
echo "export SPOTIFY_REFRESH_TOKEN=\"$REFRESH_TOKEN\""
echo ""
echo "🎵 You're all set! Test with:"
echo "   node $(dirname "$0")/spotify-current.js"
