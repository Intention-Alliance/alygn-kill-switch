/**
 * Discord Adapter for Outreach Listener
 * 
 * Listens for Discord DMs and mentions via WebSocket
 * Emits standardized messages to the WebSocket Pool
 * 
 * @module services/adapters/discord-adapter
 */

const EventEmitter = require('events');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

/**
 * Discord Adapter
 * Connects to Discord bot and listens for messages
 */
class DiscordAdapter extends EventEmitter {
  /**
   * @param {Object} config - Configuration object
   * @param {string} config.token - Discord bot token
   * @param {boolean} config.listen_dms - Listen for DMs
   * @param {boolean} config.listen_mentions - Listen for mentions
   * @param {string[]} config.listen_guilds - Guild IDs to monitor
   * @param {boolean} config.enabled - Enable adapter
   */
  constructor(config = {}) {
    super();
    
    this.config = {
      token: config.token || process.env.DISCORD_BOT_TOKEN,
      listen_dms: config.listen_dms !== false,
      listen_mentions: config.listen_mentions !== false,
      listen_guilds: config.listen_guilds || [],
      enabled: config.enabled !== false,
      ...config
    };
    
    this.client = null;
    this.isConnected = false;
    this.seenMessageIds = new Set();
    this.stateFile = './state/discord-seen-ids.json';
    
    // Bind methods
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
  }

  /**
   * Connect to Discord
   * @returns {Promise<boolean>}
   */
  async connect() {
    if (!this.config.enabled) {
      console.log('[DiscordAdapter] Adapter disabled, skipping connection');
      return false;
    }

    if (!this.config.token) {
      console.error('[DiscordAdapter] Missing bot token');
      return false;
    }

    try {
      this.client = new Client({
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.DirectMessages,
          GatewayIntentBits.MessageContent
        ],
        partials: [Partials.Channel, Partials.Message, Partials.User]
      });

      // Set up event handlers
      this.client.on('ready', () => {
        this.isConnected = true;
        console.log(`[DiscordAdapter] Connected as ${this.client.user.tag}`);
        this.emit('connected');
      });

      this.client.on('messageCreate', (message) => {
        this._handleMessage(message);
      });

      this.client.on('error', (error) => {
        console.error('[DiscordAdapter] Error:', error.message);
        this.emit('error', error);
        this._scheduleReconnect();
      });

      this.client.on('disconnect', () => {
        console.log('[DiscordAdapter] Disconnected from Discord');
        this.isConnected = false;
        this.emit('disconnected');
        this._scheduleReconnect();
      });

      await this.client.login(this.config.token);
      return true;
    } catch (error) {
      console.error('[DiscordAdapter] Connection failed:', error.message);
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Disconnect from Discord
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client) {
      try {
        await this.client.destroy();
        console.log('[DiscordAdapter] Disconnected from Discord');
      } catch (error) {
        console.warn('[DiscordAdapter] Error during disconnect:', error.message);
      }
      this.client = null;
    }
    
    this.isConnected = false;
    this.emit('disconnected');
  }

  /**
   * Handle incoming Discord message
   * @private
   * @param {Object} message - Discord message object
   */
  _handleMessage(message) {
    // Skip if from bot itself
    if (message.author.bot) {
      return;
    }

    // Check if we should process this message
    let shouldProcess = false;
    let context = 'unknown';

    // Check for DM
    if (this.config.listen_dms && message.channel.type === 'DM') {
      shouldProcess = true;
      context = 'dm';
    }

    // Check for mention
    if (this.config.listen_mentions && message.mentions.has(this.client.user)) {
      shouldProcess = true;
      context = 'mention';
    }

    // Check for guild filter
    if (this.config.listen_guilds.length > 0 && message.guild) {
      if (!this.config.listen_guilds.includes(message.guild.id)) {
        shouldProcess = false;
      }
    }

    if (!shouldProcess) {
      return;
    }

    // Skip duplicates
    const messageId = message.id;
    if (this.seenMessageIds.has(messageId)) {
      return;
    }
    
    this.seenMessageIds.add(messageId);

    // Build message data
    const discordData = {
      type: 'discord',
      data: {
        id: messageId,
        from: {
          id: message.author.id,
          username: message.author.username,
          discriminator: message.author.discriminator,
          globalName: message.author.globalName
        },
        to: {
          id: this.client.user.id,
          username: this.client.user.username
        },
        body: {
          text: message.content,
          attachments: message.attachments.map(a => ({
            id: a.id,
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
            url: a.url
          }))
        },
        timestamp: message.createdAt.toISOString(),
        context,
        channel: {
          id: message.channel.id,
          type: message.channel.type,
          name: message.channel.name || 'DM'
        },
        guild: message.guild ? {
          id: message.guild.id,
          name: message.guild.name
        } : null,
        mentions: message.mentions.users.map(u => ({
          id: u.id,
          username: u.username
        })),
        replyTo: message.reference?.messageId || null,
        threadId: message.channel.isThread() ? message.channel.id : null
      },
      timestamp: Date.now(),
      source: 'discord'
    };

    this.emit('message', discordData);
  }

  /**
   * Send a Discord message
   * @param {string} channelId - Channel ID
   * @param {string} content - Message content
   * @param {Object} options - Additional options
   * @returns {Promise<boolean>}
   */
  async sendMessage(channelId, content, options = {}) {
    if (!this.config.enabled || !this.client) {
      console.warn('[DiscordAdapter] Cannot send - adapter unavailable');
      return false;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        console.error('[DiscordAdapter] Channel not found:', channelId);
        return false;
      }

      await channel.send({
        content,
        files: options.files || [],
        reply: options.replyTo ? { messageId: options.replyTo } : undefined
      });

      console.log(`[DiscordAdapter] Message sent to channel ${channelId}`);
      return true;
    } catch (error) {
      console.error('[DiscordAdapter] Send failed:', error.message);
      return false;
    }
  }

  /**
   * Schedule reconnection
   * @private
   */
  _scheduleReconnect() {
    if (this.isConnected || this.client) {
      this.isConnected = false;
      console.log('[DiscordAdapter] Scheduling reconnect in 30s...');
      setTimeout(() => {
        this.connect();
      }, 30000);
    }
  }

  /**
   * Get adapter status
   * @returns {Object}
   */
  getStatus() {
    return {
      connected: this.isConnected,
      user: this.client?.user?.tag || null,
      enabled: this.config.enabled,
      seenMessages: this.seenMessageIds.size,
      guilds: this.client?.guilds?.cache?.size || 0
    };
  }
}

module.exports = { DiscordAdapter };