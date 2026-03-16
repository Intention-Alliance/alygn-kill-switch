
/**
 * Search Spotify for tracks, albums, artists, or playlists
 * Usage: node spotify-search.js <type> <query> [--limit N] [--json] [--market CODE]
 */

const SpotifyClient = require('./spotify-client');

async function search(type, query, options = {}) {
  const client = new SpotifyClient();
  const api = await client.getApi();

  const limit = options.limit || 5;
  const market = options.market || 'CR';

  try {
    const result = await api.search(query, [type], { limit, market });
    
    if (options.json) {
      console.log(JSON.stringify(result.body, null, 2));
      return;
    }

    // Format output based on type
    if (type === 'track') {
      const tracks = result.body.tracks.items;
      if (tracks.length === 0) {
        console.log('No tracks found.');
        return;
      }

      tracks.forEach((track, i) => {
        const artists = track.artists.map(a => a.name).join(', ');
        const duration = formatDuration(track.duration_ms);
        console.log(`${i + 1}. 🎵 ${track.name}`);
        console.log(`   👤 ${artists}`);
        console.log(`   💿 ${track.album.name}`);
        console.log(`   ⏱️  ${duration}`);
        console.log(`   🔗 ${track.external_urls.spotify}`);
        console.log(`   ID: ${track.id}`);
        console.log();
      });
    } else if (type === 'artist') {
      const artists = result.body.artists.items;
      if (artists.length === 0) {
        console.log('No artists found.');
        return;
      }

      artists.forEach((artist, i) => {
        const genres = artist.genres.join(', ') || 'N/A';
        console.log(`${i + 1}. 👤 ${artist.name}`);
        console.log(`   🎸 ${genres}`);
        console.log(`   ⭐ Popularity: ${artist.popularity}/100`);
        console.log(`   👥 ${artist.followers.total.toLocaleString()} followers`);
        console.log(`   🔗 ${artist.external_urls.spotify}`);
        console.log(`   ID: ${artist.id}`);
        console.log();
      });
    } else if (type === 'album') {
      const albums = result.body.albums.items;
      if (albums.length === 0) {
        console.log('No albums found.');
        return;
      }

      albums.forEach((album, i) => {
        const artists = album.artists.map(a => a.name).join(', ');
        console.log(`${i + 1}. 💿 ${album.name}`);
        console.log(`   👤 ${artists}`);
        console.log(`   📅 ${album.release_date}`);
        console.log(`   🎵 ${album.total_tracks} tracks`);
        console.log(`   🔗 ${album.external_urls.spotify}`);
        console.log(`   ID: ${album.id}`);
        console.log();
      });
    } else if (type === 'playlist') {
      const playlists = result.body.playlists.items;
      if (playlists.length === 0) {
        console.log('No playlists found.');
        return;
      }

      playlists.forEach((playlist, i) => {
        console.log(`${i + 1}. 📋 ${playlist.name}`);
        console.log(`   👤 by ${playlist.owner.display_name}`);
        console.log(`   🎵 ${playlist.tracks.total} tracks`);
        if (playlist.description) {
          console.log(`   📝 ${playlist.description.replace(/<[^>]*>/g, '')}`);
        }
        console.log(`   🔗 ${playlist.external_urls.spotify}`);
        console.log(`   ID: ${playlist.id}`);
        console.log();
      });
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Parse command line args
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node spotify-search.js <type> <query> [--limit N] [--json] [--market CODE]');
  console.error('Types: track, artist, album, playlist');
  process.exit(1);
}

const type = args[0];
let query = args[1];
const options = {};

// Parse flags
for (let i = 2; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    options.limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === '--market' && args[i + 1]) {
    options.market = args[i + 1];
    i++;
  } else if (args[i] === '--json') {
    options.json = true;
  }
}

search(type, query, options);
