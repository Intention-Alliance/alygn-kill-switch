#!/usr/bin/env node
/**
 * Outreach Listener - Real-Time Communication Hub
 * 
 * Unified real-time listener for VC/Municipal Outreach communications.
 * Uses WebSocket Pool (#113 framework) for connection management.
 * 
 * Architecture:
 *   Email/Signal/Discord → WebSocket Pool → Intent Classifier → Action Handler
 * 
 * Features:
 *   - Multi-channel listening (Email IMAP, Signal, Discord)
 *   - Intent classification (reply, new_thread, urgent, spam)
 *   - Fail-open behavior (continues if Redis unavailable)
 *   - Graceful shutdown with connection draining
 *   - Auto-reconnection for dropped connections
 * 
 * @module services/outreach-listener
 */

const path = require('path');
const EventEmitter = require('events');

// Load configuration
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'outreach-listener.json');
let config;
try {
  config = require(CONFIG_PATH);
  console.log('[OutreachListener] Loaded configuration from', CONFIG_PATH);
} catch (error) {
  console.error('[OutreachListener] Failed to load config:', error.message);
  config = {};
}

// Import core WebSocket Pool framework
const { createWebSocketPool } = require('../core/websocket-pool');
const { createWebSocketLifecycle } = require('../middleware/websocket-lifecycle');

// Import adapters
const { EmailImapAdapter } = require('./adapters/email-imap');
const { SignalAdapter } = require('./adapters/signal-adapter');
const { DiscordAdapter } = require('./adapters/discord-adapter');

// Import classifier and handlers
const { IntentClassifier } = require('./intent-classifier');
const { OutreachHandler } = require('./handlers/outreach-handler');

/**
 * Outreach Listener Service
 * Main service coordinating all adapters through WebSocket Pool
 */
class OutreachListener extends EventEmitter {
  /**
   * @param {Object} config - Configuration object
   */
  constructor(config = {}) {
    super();
    
    this.config = {
      channels: config.channels || ['email', 'signal', 'discord'],
      websocket_pool: config.websocket_pool || {},
      redis: config.redis || {},
      notion: config.notion || {},
      urgent_contacts: config.urgent_contacts || {},
      email: config.email || {},
      signal: config.signal || {},
      discord: config.discord || {},
      ...config
    };
    
    // Core components
    this.pool = null;
    this.lifecycle = null;
    
    // Adapters
    this.adapters = {
      email: null,
      signal: null,
      discord: null
    };
    
    // Processing pipeline
    this.classifier = null;
    this.handler = null;
    
    // State
    this.isRunning = false;
    this.shuttingDown = false;
    this.messageCount = 0;
    
    // Bind methods
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this._handleMessage = this._handleMessage.bind(this);
    this._setupSignalHandlers = this._setupSignalHandlers.bind(this);
  }

  /**
   * Initialize and start the listener
   * @returns {Promise<boolean>}
   */
  async start() {
    if (this.isRunning) {
      console.log('[OutreachListener] Already running');
      return true;
    }

    console.log('[OutreachListener] Starting outreach listener...');
    this.isRunning = true;

    try {
      // 1. Initialize WebSocket Pool
      await this._initWebSocketPool();

      // 2. Initialize adapters
      await this._initAdapters();

      // 3. Initialize classifier and handler
      this._initPipeline();

      // 4. Set up signal handlers
      this._setupSignalHandlers();

      console.log('[OutreachListener] ✅ Started successfully');
      this.emit('started');

      return true;
    } catch (error) {
      console.error('[OutreachListener] Failed to start:', error.message);
      this.emit('error', error);
      this.isRunning = false;
      return false;
    }
  }

  /**
   * Initialize WebSocket Pool
   * @private
   * @returns {Promise<void>}
   */
  async _initWebSocketPool() {
    const poolConfig = this.config.websocket_pool || {};
    
    console.log('[OutreachListener] Initializing WebSocket Pool...');
    
    // Create pool instance
    this.pool = createWebSocketPool({
      serverId: poolConfig.server_id || 'outreach-listener-01',
      heartbeatInterval: poolConfig.heartbeat_interval || 30000,
      heartbeatTimeout: poolConfig.heartbeat_timeout || 90000
    });

    // Create lifecycle manager
    this.lifecycle = createWebSocketLifecycle(this.pool);

    // Set up pool event handlers
    this.pool.on('connection:registered', (data) => {
      console.log(`[OutreachListener] Connection registered: ${data.userId} (${data.local ? 'local' : 'redis'})`);
    });

    this.pool.on('connection:unregistered', (data) => {
      console.log(`[OutreachListener] Connection unregistered: ${data.userId}`);
    });

    this.pool.on('redis:disconnected', (error) => {
      console.warn('[OutreachListener] Redis disconnected, using local fallback:', error.message);
    });

    this.pool.on('redis:connected', () => {
      console.log('[OutreachListener] Redis connected');
    });

    this.pool.on('shutdown:start', (data) => {
      console.log(`[OutreachListener] Pool shutdown starting, connections: ${data.connectionCount}`);
    });

    this.pool.on('shutdown:complete', (stats) => {
      console.log(`[OutreachListener] Pool shutdown complete: ${JSON.stringify(stats)}`);
    });

    console.log(`[OutreachListener] WebSocket Pool initialized (server: ${this.pool.serverId})`);
  }

  /**
   * Initialize channel adapters
   * @private
   * @returns {Promise<void>}
   */
  async _initAdapters() {
    const channels = this.config.channels || [];

    // Email adapter
    if (channels.includes('email')) {
      console.log('[OutreachListener] Initializing Email adapter...');
      this.adapters.email = new EmailImapAdapter({
        ...this.config.email,
        password: process.env.EMAIL_PASSWORD || this.config.email.password
      });

      this.adapters.email.on('message', (msg) => this._handleMessage(msg));
      this.adapters.email.on('connected', () => {
        console.log('[OutreachListener] Email adapter connected');
        this._registerAdapterConnection('email');
      });
      this.adapters.email.on('disconnected', () => {
        console.log('[OutreachListener] Email adapter disconnected');
      });
      this.adapters.email.on('error', (error) => {
        console.warn('[OutreachListener] Email adapter error:', error.message);
      });

      await this.adapters.email.connect();
    }

    // Signal adapter
    if (channels.includes('signal')) {
      console.log('[OutreachListener] Initializing Signal adapter...');
      this.adapters.signal = new SignalAdapter(this.config.signal);

      this.adapters.signal.on('message', (msg) => this._handleMessage(msg));
      this.adapters.signal.on('connected', () => {
        console.log('[OutreachListener] Signal adapter connected');
        this._registerAdapterConnection('signal');
      });
      this.adapters.signal.on('disconnected', () => {
        console.log('[OutreachListener] Signal adapter disconnected');
      });
      this.adapters.signal.on('error', (error) => {
        console.warn('[OutreachListener] Signal adapter error:', error.message);
      });

      await this.adapters.signal.connect();
    }

    // Discord adapter
    if (channels.includes('discord')) {
      console.log('[OutreachListener] Initializing Discord adapter...');
      this.adapters.discord = new DiscordAdapter({
        ...this.config.discord,
        token: process.env.DISCORD_BOT_TOKEN || this.config.discord.token
      });

      this.adapters.discord.on('message', (msg) => this._handleMessage(msg));
      this.adapters.discord.on('connected', () => {
        console.log('[OutreachListener] Discord adapter connected');
        this._registerAdapterConnection('discord');
      });
      this.adapters.discord.on('disconnected', () => {
        console.log('[OutreachListener] Discord adapter disconnected');
      });
      this.adapters.discord.on('error', (error) => {
        console.warn('[OutreachListener] Discord adapter error:', error.message);
      });

      await this.adapters.discord.connect();
    }

    console.log(`[OutreachListener] Adapters initialized: ${channels.join(', ')}`);
  }

  /**
   * Register adapter connection in WebSocket Pool
   * @private
   * @param {string} adapterType - Adapter type
   */
  _registerAdapterConnection(adapterType) {
    // Each adapter registers as a "connection" in the pool
    // This allows tracking which adapters are active
    const userId = `adapter:${adapterType}`;
    
    // Create a mock WebSocket for the adapter
    const mockWs = {
      readyState: 1, // OPEN
      send: () => {},
      terminate: () => {},
      close: () => {}
    };

    this.lifecycle.onConnect(mockWs, {
      userId,
      metadata: { adapter: adapterType, type: 'internal' }
    });
  }

  /**
   * Initialize processing pipeline
   * @private
   */
  _initPipeline() {
    // Intent classifier
    this.classifier = new IntentClassifier({
      useLLM: false,
      confidenceThreshold: 1.0
    });

    this.classifier.on('classified', (result) => {
      console.log(`[OutreachListener] Classified: ${result.classification.intent} (${result.classification.confidence.toFixed(2)})`);
    });

    // Outreach handler
    this.handler = new OutreachHandler(
      {
        notion: this.config.notion,
        urgent_contacts: this.config.urgent_contacts
      },
      this.adapters.signal,
      this.adapters.discord
    );

    this.handler.on('handled', ({ classified, result }) => {
      console.log(`[OutreachListener] Handled: ${result.action}`);
    });

    console.log('[OutreachListener] Processing pipeline initialized');
  }

  /**
   * Handle incoming message from any adapter
   * @private
   * @param {Object} message - Standardized message from adapter
   */
  async _handleMessage(message) {
    this.messageCount++;
    
    console.log(`[OutreachListener] Received message from ${message.source} (${this.messageCount} total)`);

    try {
      // 1. Classify intent
      const classified = this.classifier.classify(message);

      // 2. Handle based on intent
      const result = await this.handler.handle(classified);

      // 3. Emit processed event
      this.emit('message:processed', {
        original: message,
        classified,
        handlerResult: result
      });

    } catch (error) {
      console.error('[OutreachListener] Error processing message:', error.message);
      this.emit('error', { message: 'message_processing', error, original: message });
    }
  }

  /**
   * Set up process signal handlers for graceful shutdown
   * @private
   */
  _setupSignalHandlers() {
    const shutdown = async (signal) => {
      if (this.shuttingDown) {
        console.log('[OutreachListener] Already shutting down...');
        return;
      }

      console.log(`\n[OutreachListener] Received ${signal}, initiating graceful shutdown...`);
      this.shuttingDown = true;

      await this.stop();

      console.log('[OutreachListener] Shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      console.error('[OutreachListener] Uncaught exception:', error);
      if (!this.shuttingDown) {
        this.stop();
      }
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[OutreachListener] Unhandled rejection:', reason);
    });
  }

  /**
   * Stop the listener and clean up
   * @returns {Promise<void>}
   */
  async stop() {
    console.log('[OutreachListener] Stopping outreach listener...');

    // 1. Stop accepting new messages
    this.isRunning = false;

    // 2. Disconnect adapters
    for (const [name, adapter] of Object.entries(this.adapters)) {
      if (adapter) {
        console.log(`[OutreachListener] Disconnecting ${name} adapter...`);
        await adapter.disconnect();
      }
    }

    // 3. Shutdown WebSocket Pool
    if (this.lifecycle) {
      console.log('[OutreachListener] Shutting down WebSocket Pool...');
      await this.lifecycle.onShutdown({ timeout: 30000 });
    }

    if (this.pool) {
      await this.pool.close();
    }

    // 4. Emit stopped event
    this.emit('stopped');

    console.log('[OutreachListener] Stopped');
  }

  /**
   * Get service status
   * @returns {Object}
   */
  getStatus() {
    const adapterStatus = {};
    
    for (const [name, adapter] of Object.entries(this.adapters)) {
      if (adapter) {
        adapterStatus[name] = adapter.getStatus();
      }
    }

    return {
      running: this.isRunning,
      shuttingDown: this.shuttingDown,
      messageCount: this.messageCount,
      websocketPool: {
        serverId: this.pool?.serverId || null,
        connectionCount: this.pool?.getConnectionCount() || 0,
        redisAvailable: this.pool?.isRedisAvailable() || false
      },
      adapters: adapterStatus,
      classifier: this.classifier?.getStats() || null,
      handler: this.handler?.getStats() || null
    };
  }
}

/**
 * Create outreach listener instance
 * @param {Object} config - Configuration
 * @returns {OutreachListener}
 */
function createOutreachListener(config = {}) {
  return new OutreachListener(config);
}

// CLI entry point
if (require.main === module) {
  const listener = createOutreachListener(config);

  listener.on('started', () => {
    console.log('[OutreachListener] 🎯 Ready to listen for outreach communications');
  });

  listener.on('stopped', () => {
    console.log('[OutreachListener] 👋 Listener stopped');
  });

  listener.on('error', (error) => {
    console.error('[OutreachListener] Error:', error);
  });

  listener.on('message:processed', ({ classified, handlerResult }) => {
    const { source, data } = classified.original;
    console.log(`[OutreachListener] 📨 Processed: ${source} → ${classified.classification.intent} → ${handlerResult.action}`);
  });

  // Start the listener
  listener.start().then((success) => {
    if (!success) {
      console.error('[OutreachListener] Failed to start');
      process.exit(1);
    }
  });
}

module.exports = { OutreachListener, createOutreachListener };