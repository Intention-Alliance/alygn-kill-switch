## Spotify Integration

**Status:** ⚠️ Pending credentials (skill prepared, waiting for setup)

**Location:** `~/.openclaw/workspace/skills/spotify/`

### Quick Commands

Once configured, you can use these from the agent:

```javascript
// Search for a track
await exec({ command: "node ~/.openclaw/workspace/skills/spotify/scripts/spotify-search.js track 'Bohemian Rhapsody' --limit 3" });

// Get current track
await exec({ command: "node ~/.openclaw/workspace/skills/spotify/scripts/spotify-current.js" });

// JSON output for parsing
const result = await exec({ 
  command: "node ~/.openclaw/workspace/skills/spotify/scripts/spotify-search.js track 'test' --limit 1 --json" 
});
const data = JSON.parse(result);
```

### Setup Needed

1. Create app at https://developer.spotify.com/dashboard
2. Run: `cd ~/.openclaw/workspace/skills/spotify && npm install`
3. Run: `./scripts/spotify-auth.sh` (sets up OAuth)
4. Add credentials to `openclaw.json` under `skills.entries.spotify`

### Features Available After Setup

- Search tracks, albums, artists, playlists
- Get currently playing track
- Control playback (Premium only)
- Manage playlists
- Get recommendations
- View top tracks/artists
- Audio analysis

**Full docs:** `~/.openclaw/workspace/skills/spotify/SKILL.md`
