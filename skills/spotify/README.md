# Spotify Skill - Quick Start

## Setup

1. **Install dependencies:**
   ```bash
   cd ~/.openclaw/workspace/skills/spotify
   npm install
   ```

2. **Create Spotify Developer App:**
   - Go to https://developer.spotify.com/dashboard
   - Create new app
   - Add redirect URI: `http://localhost:8888/callback`
   - Note your Client ID and Client Secret

3. **Authenticate:**
   ```bash
   export SPOTIFY_CLIENT_ID="your_client_id"
   export SPOTIFY_CLIENT_SECRET="your_client_secret"
   ./scripts/spotify-auth.sh
   ```

4. **Add refresh token to config:**
   Edit `~/.openclaw/openclaw.json`:
   ```json
   {
     "skills": {
       "entries": {
         "spotify": {
           "clientId": "...",
           "clientSecret": "...",
           "refreshToken": "..."
         }
       }
     }
   }
   ```

## Quick Test

```bash
# Search for a track
node scripts/spotify-search.js track "Bohemian Rhapsody"

# See what's playing (requires active Spotify session)
node scripts/spotify-current.js
```

## Full Documentation

See `SKILL.md` for complete documentation of all available scripts and features.

## Features

- ✅ Search (tracks, albums, artists, playlists)
- ✅ Current playback status
- 🚧 Playback control (needs implementation)
- 🚧 Playlist management (needs implementation)
- 🚧 Top tracks/artists (needs implementation)
- 🚧 Recommendations (needs implementation)

**Note:** Only search and current track are implemented. Other features are documented but need implementation when credentials are available for testing.
