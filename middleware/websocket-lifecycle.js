/**
 * WebSocket Lifecycle Middleware
 * 
 * Provides lifecycle hooks for WebSocket connections:
 * - onConnect: Register connection in Redis
 * - onDisconnect: Remove from registry
 * - onHeartbeat: Update last seen timestamp
 * - onShutdown: Notify clients to reconnect, drain period
 * 
 * Usage:
 *   const { createWebSocketLifecycle } = require('./middleware/websocket-lifecycle');
 *   const { createWebSocketPool } = require('../core/websocket-pool');
 *   
 *   const pool = createWebSocketPool({ redisClient, serverId: 'server-1' });
 *   const lifecycle = createWebSocketLifecycle(pool);
 *   
 *   // In WebSocket server
 *   wss.on('connection', (ws, req) => {
 *     lifecycle.onConnect(ws, { userId: 'user123' });
 *     
 *     ws.on('close', () => lifecycle.onDisconnect(ws));
 *     ws.on('pong', () => lifecycle.onHeartbeat(ws));
 *   });
 *   
 *   // On server shutdown
 *   await lifecycle.onShutdown();
 */

const { createWebSocketPool } = require('../core/websocket-pool');

// Symbol to attach user info to WebSocket instances
const WS_USER_SYMBOL = Symbol('ws:user');

/**
 * WebSocket Lifecycle Manager
 */
class WebSocketLifecycle {
  /**
   * @param {WebSocketPool} pool - Connection pool instance
   */
  constructor(pool) {
    if (!pool) {
      throw new Error('WebSocketPool instance is required');
    }
    
    this.pool = pool;
    
    // Track heartbeat intervals per connection
    this.heartbeatIntervals = new Map();
    
    // Bind methods
    this.onConnect = this.onConnect.bind(this);
    this.onDisconnect = this.onDisconnect.bind(this);
    this.onHeartbeat = this.onHeartbeat.bind(this);
    this.onShutdown = this.onShutdown.bind(this);
  }

  /**
   * Handle new WebSocket connection
   * @param {Object} ws - WebSocket instance
   * @param {Object} context - Connection context
   * @param {string} context.userId - User identifier
   * @param {Object} context.metadata - Optional metadata
   * @returns {Promise<boolean>} Success status
   */
  async onConnect(ws, context) {
    const { userId, metadata = {} } = context || {};
    
    if (!userId) {
      console.warn('WebSocketLifecycle: onConnect called without userId');
      return false;
    }

    // Attach user info to WebSocket instance
    ws[WS_USER_SYMBOL] = { userId, metadata, connectedAt: Date.now() };

    // Register in pool
    const success = await this.pool.register(userId, ws);
    
    if (success) {
      console.log(`WebSocketLifecycle: User ${userId} connected to ${this.pool.serverId}`);
      
      // Send connection acknowledgment
      this._sendSystemMessage(ws, {
        type: 'connection_ack',
        serverNode: this.pool.serverId,
        timestamp: Date.now()
      });

      // Set up automatic heartbeat if ws.ping is available
      if (ws.ping) {
        this._startAutoHeartbeat(ws, userId);
      }
    }

    return success;
  }

  /**
   * Handle WebSocket disconnection
   * @param {Object} ws - WebSocket instance
   * @returns {Promise<void>}
   */
  async onDisconnect(ws) {
    const userInfo = ws[WS_USER_SYMBOL];
    if (!userInfo) {
      return;
    }

    const { userId } = userInfo;

    // Stop heartbeat interval
    this._stopAutoHeartbeat(ws);

    // Unregister from pool
    await this.pool.unregister(userId);

    console.log(`WebSocketLifecycle: User ${userId} disconnected from ${this.pool.serverId}`);

    // Clean up
    delete ws[WS_USER_SYMBOL];
  }

  /**
   * Handle heartbeat (pong received)
   * @param {Object} ws - WebSocket instance
   * @returns {Promise<void>}
   */
  async onHeartbeat(ws) {
    const userInfo = ws[WS_USER_SYMBOL];
    if (!userInfo) {
      return;
    }

    const { userId } = userInfo;

    // Update heartbeat in pool
    await this.pool.heartbeat(userId);
  }

  /**
   * Handle graceful shutdown
   * @param {Object} options
   * @param {number} options.timeout - Drain timeout in ms
   * @returns {Promise<Object>} Shutdown stats
   */
  async onShutdown(options = {}) {
    const { timeout } = options;
    
    console.log('WebSocketLifecycle: Starting graceful shutdown');
    
    // Stop all heartbeat intervals
    for (const ws of this.heartbeatIntervals.keys()) {
      this._stopAutoHeartbeat(ws);
    }

    // Delegate to pool
    return await this.pool.shutdown(timeout);
  }

  /**
   * Start automatic heartbeat for a connection
   * @private
   * @param {Object} ws - WebSocket instance
   * @param {string} userId - User identifier
   */
  _startAutoHeartbeat(ws, userId) {
    // Clear existing interval if any
    this._stopAutoHeartbeat(ws);

    const interval = setInterval(() => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.ping();
      } else {
        this._stopAutoHeartbeat(ws);
      }
    }, this.pool.heartbeatInterval);

    this.heartbeatIntervals.set(ws, interval);

    // Don't prevent process exit
    if (interval.unref) {
      interval.unref();
    }
  }

  /**
   * Stop automatic heartbeat for a connection
   * @private
   * @param {Object} ws - WebSocket instance
   */
  _stopAutoHeartbeat(ws) {
    const interval = this.heartbeatIntervals.get(ws);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(ws);
    }
  }

  /**
   * Send a system message to a WebSocket
   * @private
   * @param {Object} ws - WebSocket instance
   * @param {Object} data - Message data
   */
  _sendSystemMessage(ws, data) {
    if (ws.readyState === 1 && typeof ws.send === 'function') { // WebSocket.OPEN
      try {
        ws.send(JSON.stringify(data));
      } catch (error) {
        console.warn('WebSocketLifecycle: Failed to send system message:', error.message);
      }
    }
  }

  /**
   * Get user info from WebSocket
   * @param {Object} ws - WebSocket instance
   * @returns {Object|null}
   */
  getUserInfo(ws) {
    return ws[WS_USER_SYMBOL] || null;
  }

  /**
   * Broadcast a message to all connected users
   * @param {Object} data - Message data
   * @param {Object} options
   * @param {string[]} options.excludeUsers - User IDs to exclude
   * @returns {Promise<Object>} Broadcast stats
   */
  async broadcast(data, options = {}) {
    const { excludeUsers = [] } = options;
    const connections = this.pool.getAllConnections();
    let sent = 0;
    let failed = 0;

    for (const connection of connections) {
      if (excludeUsers.includes(connection.userId)) {
        continue;
      }

      try {
        if (connection.ws && connection.ws.readyState === 1) {
          connection.ws.send(JSON.stringify(data));
          sent++;
        }
      } catch (error) {
        console.warn(`WebSocketLifecycle: Failed to broadcast to ${connection.userId}:`, error.message);
        failed++;
      }
    }

    return { sent, failed, total: connections.length };
  }

  /**
   * Send a message to a specific user
   * @param {string} userId - Target user ID
   * @param {Object} data - Message data
   * @returns {Promise<boolean>} Success status
   */
  async sendToUser(userId, data) {
    const connection = this.pool.getConnection(userId);
    
    if (!connection || !connection.ws) {
      console.warn(`WebSocketLifecycle: User ${userId} not found on this server`);
      return false;
    }

    try {
      if (connection.ws.readyState === 1) {
        connection.ws.send(JSON.stringify(data));
        return true;
      }
    } catch (error) {
      console.warn(`WebSocketLifecycle: Failed to send to ${userId}:`, error.message);
    }

    return false;
  }
}

/**
 * Create WebSocket lifecycle manager
 * @param {WebSocketPool} pool - Connection pool instance
 * @returns {WebSocketLifecycle}
 */
function createWebSocketLifecycle(pool) {
  return new WebSocketLifecycle(pool);
}

/**
 * Create Express middleware for WebSocket upgrade handling
 * @param {WebSocketLifecycle} lifecycle - Lifecycle manager
 * @param {Function} getUserId - Function to extract userId from request
 * @returns {Function} Express middleware
 */
function createWebSocketMiddleware(lifecycle, getUserId = null) {
  const defaultGetUserId = (req) => {
    return req.user?.id || req.userId || req.query?.userId || null;
  };

  const extractUserId = getUserId || defaultGetUserId;

  return function websocketUpgradeHandler(req, res, next) {
    // Attach lifecycle helper to request for use in upgrade handler
    req.websocketLifecycle = {
      /**
       * Handle connection
       * @param {Object} ws - WebSocket instance
       * @param {Object} context - Connection context
       */
      onConnect: async (ws, context = {}) => {
        const userId = context.userId || extractUserId(req);
        return await lifecycle.onConnect(ws, {
          userId,
          metadata: context.metadata || {}
        });
      },

      /**
       * Handle disconnection
       * @param {Object} ws - WebSocket instance
       */
      onDisconnect: async (ws) => {
        await lifecycle.onDisconnect(ws);
      },

      /**
       * Handle heartbeat
       * @param {Object} ws - WebSocket instance
       */
      onHeartbeat: async (ws) => {
        await lifecycle.onHeartbeat(ws);
      },

      /**
       * Get lifecycle manager
       * @returns {WebSocketLifecycle}
       */
      getManager: () => lifecycle,

      /**
       * Get pool instance
       * @returns {WebSocketPool}
       */
      getPool: () => lifecycle.pool
    };

    next();
  };
}

module.exports = {
  WebSocketLifecycle,
  createWebSocketLifecycle,
  createWebSocketMiddleware,
  WS_USER_SYMBOL
};
