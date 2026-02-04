#!/usr/bin/env node

/**
 * Get currently playing track
 * Usage: node spotify-current.js [--json]
 */

const SpotifyClient = require('./spotify-client');

async function getCurrentTrack(options = {}) {
  const client = new SpotifyClient();
  const api = await client.getApi();

  try {
    const result = await api.getMyCurrentPlayingTrack();
    
    if (!result.body || !result.body.item) {
      console.log('Nothing is currently playing.');
      return;
    }

    if (options.json) {
      console.log(JSON.stringify(result.body, null, 2));
      return;
    }

    const track = result.body.item;
    const artists = track.artists.map(a => a.name).join(', ');
    const progress = formatDuration(result.body.progress_ms);
    const duration = formatDuration(track.duration_ms);
    const isPlaying = result.body.is_playing;
    const device = result.body.device;
    const shuffle = result.body.shuffle_state ? '🔀 ON' : '🔀 OFF';
    const repeat = result.body.repeat_state === 'track' ? '🔁 Track' : 
                   result.body.repeat_state === 'context' ? '🔁 Playlist' : '🔁 OFF';

    console.log(`🎵 ${track.name}`);
    console.log(`👤 ${artists}`);
    console.log(`💿 ${track.album.name}`);
    console.log(`⏱️  ${progress} / ${duration}`);
    console.log(`${isPlaying ? '▶️  Playing' : '⏸️  Paused'} on ${device.name}`);
    console.log(`${shuffle} | ${repeat}`);
    console.log(`🔗 ${track.external_urls.spotify}`);
  } catch (err) {
    if (err.statusCode === 204) {
      console.log('Nothing is currently playing.');
      return;
    }
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
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') {
    options.json = true;
  }
}

getCurrentTrack(options);
