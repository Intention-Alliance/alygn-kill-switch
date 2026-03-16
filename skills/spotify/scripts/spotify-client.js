
/**
 * Spotify API client helper
 * Handles authentication and token refresh
 */

const SpotifyWebApi = require('spotify-web-api-node');
const fs = require('fs');
const path = require('path');

// Token cache location
const TOKEN_CACHE = path.join(process.env.HOME, '.openclaw', '.spotify-token-cache.json');

class SpotifyClient {
  constructor() {
    // Get credentials from config or env
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      // Try loading from OpenClaw config
      const configPath = path.join(process.env.HOME, '.openclaw', 'openclaw.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const spotifyConfig = config.skills?.entries?.spotify;
        
        this.clientId = spotifyConfig?.clientId || clientId;
        this.clientSecret = spotifyConfig?.clientSecret || clientSecret;
        this.refreshToken = spotifyConfig?.refreshToken || refreshToken;
      } else {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.refreshToken = refreshToken;
      }
    } else {
      this.clientId = clientId;
      this.clientSecret = clientSecret;
      this.refreshToken = refreshToken;
    }

    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('Missing Spotify credentials. Set SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REFRESH_TOKEN.');
    }

    this.api = new SpotifyWebApi({
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      refreshToken: this.refreshToken,
      redirectUri: 'http://localhost:8888/callback'
    });

    this.accessToken = null;
    this.expiresAt = null;
  }

  // Load cached token if still valid
  loadCachedToken() {
    if (!fs.existsSync(TOKEN_CACHE)) return false;

    try {
      const cache = JSON.parse(fs.readFileSync(TOKEN_CACHE, 'utf8'));
      if (cache.expiresAt && Date.now() < cache.expiresAt) {
        this.accessToken = cache.accessToken;
        this.expiresAt = cache.expiresAt;
        this.api.setAccessToken(this.accessToken);
        return true;
      }
    } catch (err) {
      // Invalid cache, ignore
    }
    return false;
  }

  // Save token to cache
  saveCachedToken() {
    const cache = {
      accessToken: this.accessToken,
      expiresAt: this.expiresAt
    };
    fs.writeFileSync(TOKEN_CACHE, JSON.stringify(cache, null, 2));
  }

  // Refresh access token
  async refreshAccessToken() {
    try {
      const data = await this.api.refreshAccessToken();
      this.accessToken = data.body.access_token;
      this.expiresAt = Date.now() + (data.body.expires_in * 1000);
      this.api.setAccessToken(this.accessToken);
      this.saveCachedToken();
    } catch (err) {
      throw new Error(`Failed to refresh access token: ${err.message}`);
    }
  }

  // Ensure valid access token
  async ensureToken() {
    // Try cached token first
    if (this.loadCachedToken()) {
      return;
    }

    // Refresh token
    await this.refreshAccessToken();
  }

  // Get API instance
  async getApi() {
    await this.ensureToken();
    return this.api;
  }
}

module.exports = SpotifyClient;
