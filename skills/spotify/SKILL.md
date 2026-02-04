# Spotify Skill

Interact with Spotify API for search, playback control, and playlist management.

## Prerequisites

1. **Spotify Developer App:**
   - Create app at https://developer.spotify.com/dashboard
   - Note your Client ID and Client Secret
   - Add redirect URI: `http://localhost:8888/callback`

2. **Required npm packages:**
   ```bash
   npm install -g spotify-web-api-node
   ```

3. **Authorization:**
   - Run `./scripts/spotify-auth.sh` to get refresh token
   - Or manually authorize via Spotify OAuth flow

## Configuration

Add to `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "spotify": {
        "clientId": "YOUR_SPOTIFY_CLIENT_ID",
        "clientSecret": "YOUR_SPOTIFY_CLIENT_SECRET",
        "refreshToken": "YOUR_REFRESH_TOKEN"
      }
    }
  }
}
```

Or set environment variables:
```bash
export SPOTIFY_CLIENT_ID="..."
export SPOTIFY_CLIENT_SECRET="..."
export SPOTIFY_REFRESH_TOKEN="..."
```

## Available Scripts

### `spotify-search.js`
Search for tracks, albums, artists, or playlists.

**Usage:**
```bash
node spotify-search.js track "Bohemian Rhapsody"
node spotify-search.js artist "Queen"
node spotify-search.js album "A Night at the Opera"
node spotify-search.js playlist "Top 50 Global"
```

**Flags:**
- `--limit <n>` - Number of results (default: 5, max: 50)
- `--json` - Output raw JSON instead of formatted text
- `--market <code>` - Market/country code (e.g., US, CR, ES)

**Output:**
- Track name, artist(s), album, duration, Spotify URL
- Album name, artist, release date, tracks count
- Artist name, genres, popularity, follower count
- Playlist name, owner, track count, description

---

### `spotify-play.js`
Control playback (requires Premium + active device).

**Usage:**
```bash
# Play track by URI/ID
node spotify-play.js spotify:track:3n3Ppam7vgaVa1iaRUc9Lp
node spotify-play.js 3n3Ppam7vgaVa1iaRUc9Lp

# Control playback
node spotify-play.js --pause
node spotify-play.js --resume
node spotify-play.js --next
node spotify-play.js --previous
node spotify-play.js --shuffle on
node spotify-play.js --repeat track
node spotify-play.js --volume 50

# Queue a track
node spotify-play.js --queue spotify:track:...
```

**Flags:**
- `--device <id>` - Target specific device (see `spotify-devices.js`)
- `--pause` - Pause playback
- `--resume` - Resume playback
- `--next` - Skip to next track
- `--previous` - Go to previous track
- `--shuffle <on|off>` - Toggle shuffle
- `--repeat <track|context|off>` - Set repeat mode
- `--volume <0-100>` - Set volume level
- `--queue <uri>` - Add track to queue

---

### `spotify-current.js`
Show currently playing track.

**Usage:**
```bash
node spotify-current.js
node spotify-current.js --json
```

**Output:**
- Track name, artist(s), album
- Progress (e.g., "1:23 / 3:45")
- Playback state (playing/paused)
- Device name
- Shuffle/repeat status

---

### `spotify-playlist.js`
Manage playlists.

**Usage:**
```bash
# List your playlists
node spotify-playlist.js list

# Show playlist tracks
node spotify-playlist.js show <playlist_id>

# Create new playlist
node spotify-playlist.js create "My Playlist" --desc "Description" --public

# Add tracks to playlist
node spotify-playlist.js add <playlist_id> <track_uri> [<track_uri> ...]

# Remove tracks from playlist
node spotify-playlist.js remove <playlist_id> <track_uri> [<track_uri> ...]
```

**Flags:**
- `--limit <n>` - Results limit (default: 20)
- `--json` - Output raw JSON
- `--public` - Make playlist public (default: private)
- `--desc <text>` - Playlist description

---

### `spotify-top.js`
Get your top tracks or artists.

**Usage:**
```bash
node spotify-top.js tracks
node spotify-top.js artists
node spotify-top.js tracks --time long  # long_term, medium_term, short_term
node spotify-top.js artists --limit 10
```

**Flags:**
- `--time <short|medium|long>` - Time range (default: medium)
  - `short` = ~4 weeks
  - `medium` = ~6 months
  - `long` = several years
- `--limit <n>` - Number of results (default: 10, max: 50)
- `--json` - Output raw JSON

---

### `spotify-recommendations.js`
Get song recommendations based on seeds.

**Usage:**
```bash
# Based on artists
node spotify-recommendations.js --artists "4Z8W4fKeB5YxbusRsdQVPb,0LcJLqbBmaGUft1e9Mm8HV"

# Based on tracks
node spotify-recommendations.js --tracks "0c6xIDDpzE81m2q797ordA"

# Based on genres
node spotify-recommendations.js --genres "rock,indie,alternative"

# Mix of seeds
node spotify-recommendations.js --artists "..." --tracks "..." --genres "..."

# With audio feature filters
node spotify-recommendations.js --genres "electronic" --min-energy 0.7 --min-tempo 120
```

**Flags:**
- `--artists <ids>` - Comma-separated artist IDs
- `--tracks <ids>` - Comma-separated track IDs
- `--genres <names>` - Comma-separated genre names
- `--limit <n>` - Number of recommendations (default: 10, max: 100)
- `--market <code>` - Market code (e.g., CR, US)
- `--min-<feature> <value>` - Minimum audio feature value
- `--max-<feature> <value>` - Maximum audio feature value
- `--target-<feature> <value>` - Target audio feature value
  - Features: `energy`, `danceability`, `valence`, `tempo`, `acousticness`, etc.
- `--json` - Output raw JSON

---

### `spotify-devices.js`
List available playback devices.

**Usage:**
```bash
node spotify-devices.js
node spotify-devices.js --json
```

**Output:**
- Device name
- Device type (Computer, Smartphone, Speaker, etc.)
- Active status
- Volume level
- Device ID (for targeting with `--device`)

---

### `spotify-recent.js`
Show recently played tracks.

**Usage:**
```bash
node spotify-recent.js
node spotify-recent.js --limit 20
node spotify-recent.js --json
```

**Flags:**
- `--limit <n>` - Number of tracks (default: 10, max: 50)
- `--json` - Output raw JSON

**Output:**
- Track name, artist(s), album
- Played at timestamp
- Context (playlist/album if available)

---

### `spotify-audio-features.js`
Get audio analysis for tracks.

**Usage:**
```bash
node spotify-audio-features.js <track_id>
node spotify-audio-features.js 3n3Ppam7vgaVa1iaRUc9Lp --json
```

**Output:**
- Tempo (BPM)
- Key & Mode
- Time signature
- Energy (0.0-1.0)
- Danceability (0.0-1.0)
- Valence/mood (0.0-1.0)
- Acousticness (0.0-1.0)
- Instrumentalness (0.0-1.0)
- Speechiness (0.0-1.0)
- Liveness (0.0-1.0)
- Loudness (dB)

---

## Authentication Flow

The skill uses **OAuth 2.0 Authorization Code Flow** with refresh tokens for persistent access.

### Initial Setup

1. Run the auth script:
   ```bash
   ./scripts/spotify-auth.sh
   ```

2. This will:
   - Open your browser to Spotify's authorization page
   - Ask you to grant permissions
   - Redirect to `http://localhost:8888/callback?code=...`
   - Exchange code for access + refresh tokens
   - Save refresh token to config

3. The refresh token never expires (unless revoked), so you only need to do this once.

### Required Scopes

The auth script requests these scopes:
- `user-read-playback-state` - Read current playback
- `user-modify-playback-state` - Control playback
- `user-read-currently-playing` - Read current track
- `user-read-recently-played` - Read history
- `user-top-read` - Read top tracks/artists
- `playlist-read-private` - Read private playlists
- `playlist-read-collaborative` - Read collaborative playlists
- `playlist-modify-public` - Edit public playlists
- `playlist-modify-private` - Edit private playlists

### Token Refresh

Access tokens expire after 1 hour. The scripts automatically:
1. Check if access token is expired
2. Use refresh token to get new access token
3. Cache access token in memory (valid for 1 hour)

No manual refresh needed — it's handled automatically.

---

## Usage from OpenClaw Agent

When using from the agent, call scripts via `exec` tool:

```javascript
// Search for a track
const result = await exec({
  command: "node ~/.openclaw/workspace/skills/spotify/scripts/spotify-search.js track 'Bohemian Rhapsody' --limit 3"
});

// Play a track
await exec({
  command: "node ~/.openclaw/workspace/skills/spotify/scripts/spotify-play.js spotify:track:3n3Ppam7vgaVa1iaRUc9Lp"
});

// Get current track
const current = await exec({
  command: "node ~/.openclaw/workspace/skills/spotify/scripts/spotify-current.js --json"
});
const data = JSON.parse(current);
```

Or create helper functions in `TOOLS.md` for common operations.

---

## Error Handling

All scripts output errors to stderr and exit with non-zero code on failure.

**Common errors:**
- `Missing credentials` - Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
- `No active device` - Open Spotify on a device and start playback
- `Premium required` - Playback control requires Spotify Premium
- `Rate limit exceeded` - Wait a few seconds and retry
- `Invalid token` - Re-run `spotify-auth.sh` to get new refresh token

---

## Examples

### "What's playing right now?"
```bash
node spotify-current.js
# Output:
# 🎵 Bohemian Rhapsody
# 👤 Queen
# 💿 A Night at the Opera
# ⏱️  1:23 / 5:55
# 🔊 Playing on MacBook Pro
```

### "Play some chill music"
```bash
# Get recommendations for chill genres
node spotify-recommendations.js --genres "chill,ambient" --max-energy 0.5 --limit 20 --json > tracks.json

# Extract first track URI and play it
TRACK=$(jq -r '.tracks[0].uri' tracks.json)
node spotify-play.js "$TRACK"
```

### "Add this song to my playlist"
```bash
# Search for track
TRACK_URI=$(node spotify-search.js track "Stairway to Heaven" --limit 1 --json | jq -r '.tracks[0].uri')

# Add to playlist
node spotify-playlist.js add <your_playlist_id> "$TRACK_URI"
```

### "What are my top 5 songs this month?"
```bash
node spotify-top.js tracks --time short --limit 5
```

---

## Notes

- **Premium required:** Playback control (play, pause, skip, volume) requires Spotify Premium
- **Active device:** Playback control requires an active Spotify device (phone, desktop, web player)
- **Rate limits:** Spotify API has rate limits — don't spam requests
- **Market codes:** Use 2-letter ISO country codes (CR, US, ES, etc.) for market-specific results

---

## Troubleshooting

### "No active device found"
- Open Spotify on any device (phone, computer, web player)
- Start playing something (even if you pause it immediately)
- Run `node spotify-devices.js` to verify device is detected

### "Premium required for this operation"
- Playback control is a Premium-only feature
- Search, playlists, and user data work with free accounts

### "Invalid refresh token"
- Your refresh token may have been revoked
- Re-run `./scripts/spotify-auth.sh` to get a new one

### "Rate limit exceeded"
- Wait 30-60 seconds before retrying
- Consider caching results for frequently-accessed data

---

## Future Enhancements

Ideas for future additions:
- [ ] Lyrics fetching (via third-party APIs)
- [ ] Podcast search & playback
- [ ] Collaborative playlist management
- [ ] Smart playlist creation based on mood/activity
- [ ] Integration with last.fm for scrobbling
- [ ] Voice command wrappers for SAG TTS
- [ ] Webhook listener for playback events

---

**Ready to use once credentials are configured!** 🎵
