/**
 * WebSocket Connection Pool Manager
 * 
 * Manages WebSocket connections with Redis-backed session registry.
 * Implements heartbeat mechanism, connection pruning, and graceful shutdown.
 * 
 * Features:
 * - Distributed session tracking via Redis
 * - Heartbeat-based dead connection detection
 * - Fail-open behavior when Redis is unavailable
 * - Graceful shutdown with drain period
 * 
 * Redis Key Patterns:
 * - ws:session:{userId} → {serverNode, connectedAt, lastHeartbeat}
 * - ws:server:{serverId} → Set of userIds on this server
 */

// Redis is optional - will use local fallback if not available
let createClient;
try {
  ({ createClient } = require('redis'));
} catch (e) {
  createClient = null;
}

const EventEmitter = require('events');

// Configuration defaults
const DEFAULTS = {
  heartbeatInterval: 30000,        // 30 seconds
  heartbeatTimeout: 90000,         // 90 seconds (3x interval)
  pruneInterval: 60000,            // Prune dead connections every 60s
  drainTimeout: 30000,             // 30 seconds for graceful shutdown
  serverId: process.env.SERVER_ID || `server-${process.pid}`
};

/**
 * WebSocket Connection Pool
 * Manages connections with Redis-backed session registry
 */
class WebSocketPool extends EventEmitter {
  /**
   * @param {Object} options
   * @param {Object} options.redisClient - Optional Redis client instance
   * @param {number} options.heartbeatInterval - Heartbeat interval in ms (default: 30000)
   * @param {number} options.heartbeatTimeout - Timeout before connection considered dead (default: 90000)
   * @param {number} options.pruneInterval - How often to prune dead connections (default: 60000)
   * @param {string} options.serverId - Unique server identifier
   */
  constructor(options = {}) {
    super();
    
    const {
      redisClient,
      heartbeatInterval = DEFAULTS.heartbeatInterval,
      heartbeatTimeout = DEFAULTS.heartbeatTimeout,
      pruneInterval = DEFAULTS.pruneInterval,
      serverId = DEFAULTS.serverId
    } = options;
    
    this.serverId = serverId;
    this.heartbeatInterval = heartbeatInterval;
    this.heartbeatTimeout = heartbeatTimeout;
    this.pruneInterval = pruneInterval;
    this.redisClient = redisClient;
    
    // Local connection tracking (used when Redis is unavailable)
    this.localConnections = new Map(); // userId → { ws, connectedAt, lastHeartbeat }
    
    // Connection state
    this.connections = new Map(); // userId → { ws, connectedAt, lastHeartbeat, serverNode }
    this.shuttingDown = false;
    this.redisAvailable = true;
    
    // Timers
    this.pruneTimer = null;
    
    // Start pruning loop
    this._startPruneLoop();
  }

  /**
   * Get or create Redis client
   * @returns {Promise<Object|null>} Redis client or null if unavailable
   */
  async _getRedisClient() {
    if (!this.redisClient) {
      if (!createClient) {
        return null;
      }
      try {
        this.redisClient = createClient();
        await this.redisClient.connect();
        this.redisAvailable = true;
        this.emit('redis:connected');
      } catch (error) {
        console.warn('WebSocketPool: Redis connection failed, using local fallback:', error.message);
        this.redisAvailable = false;
        this.emit('redis:disconnected', error);
        return null;
      }
    }
    return this.redisClient;
  }

  /**
   * Register a new connection
   * @param {string} userId - User identifier
   * @param {Object} ws - WebSocket instance
   * @returns {Promise<boolean>} Success status
   */
  async register(userId, ws) {
    if (this.shuttingDown) {
      console.warn('WebSocketPool: Server is shutting down, rejecting new connection');
      return false;
    }

    const now = Date.now();
    const connection = {
      ws,
      userId,
      connectedAt: now,
      lastHeartbeat: now,
      serverNode: this.serverId
    };

    // Track locally
    this.connections.set(userId, connection);
    this.localConnections.set(userId, connection);

    // Try to register in Redis
    try {
      const client = await this._getRedisClient();
      if (client) {
        const sessionKey = `ws:session:${userId}`;
        const serverKey = `ws:server:${this.serverId}`;
        
        const sessionData = JSON.stringify({
          serverNode: this.serverId,
          connectedAt: now,
          lastHeartbeat: now
        });

        // Set session data
        await client.set(sessionKey, sessionData, { EX: Math.floor(this.heartbeatTimeout / 1000) });
        
        // Add to server's connection set
        await client.sAdd(serverKey, userId);
        
        this.redisAvailable = true;
        this.emit('connection:registered', { userId, serverNode: this.serverId });
        return true;
      }
    } catch (error) {
      console.warn('WebSocketPool: Failed to register in Redis, using local fallback:', error.message);
      this.redisAvailable = false;
      this.emit('redis:disconnected', error);
    }

    // Fail-open: connection still works locally
    this.emit('connection:registered', { userId, serverNode: this.serverId, local: true });
    return true;
  }

  /**
   * Remove a connection
   * @param {string} userId - User identifier
   * @returns {Promise<void>}
   */
  async unregister(userId) {
    const connection = this.connections.get(userId);
    if (!connection) {
      return;
    }

    // Remove from local tracking
    this.connections.delete(userId);
    this.localConnections.delete(userId);

    // Try to remove from Redis
    try {
      const client = await this._getRedisClient();
      if (client) {
        const sessionKey = `ws:session:${userId}`;
        const serverKey = `ws:server:${this.serverId}`;
        
        await Promise.all([
          client.del(sessionKey),
          client.sRem(serverKey, userId)
        ]);
        
        this.emit('connection:unregistered', { userId, serverNode: this.serverId });
        return;
      }
    } catch (error) {
      console.warn('WebSocketPool: Failed to unregister from Redis:', error.message);
    }

    this.emit('connection:unregistered', { userId, serverNode: this.serverId, local: true });
  }

  /**
   * Update heartbeat timestamp
   * @param {string} userId - User identifier
   * @returns {Promise<void>}
   */
  async heartbeat(userId) {
    const connection = this.connections.get(userId);
    if (!connection) {
      return;
    }

    const now = Date.now();
    connection.lastHeartbeat = now;

    // Try to update Redis
    try {
      const client = await this._getRedisClient();
      if (client) {
        const sessionKey = `ws:session:${userId}`;
        const sessionData = await client.get(sessionKey);
        
        if (sessionData) {
          const data = JSON.parse(sessionData);
          data.lastHeartbeat = now;
          await client.set(sessionKey, JSON.stringify(data), { EX: Math.floor(this.heartbeatTimeout / 1000) });
        }
        
        this.redisAvailable = true;
        return;
      }
    } catch (error) {
      console.warn('WebSocketPool: Failed to update heartbeat in Redis:', error.message);
      this.redisAvailable = false;
    }
  }

  /**
   * Get connection info for a user
   * @param {string} userId - User identifier
   * @returns {Object|null} Connection info or null if not found
   */
  getConnection(userId) {
    return this.connections.get(userId) || null;
  }

  /**
   * Get all connections on this server
   * @returns {Array} Array of connection info
   */
  getAllConnections() {
    return Array.from(this.connections.values());
  }

  /**
   * Get connection count
   * @returns {number}
   */
  getConnectionCount() {
    return this.connections.size;
  }

  /**
   * Find which server a user is connected to
   * @param {string} userId - User identifier
   * @returns {Promise<string|null>} Server ID or null
   */
  async getUserServer(userId) {
    try {
      const client = await this._getRedisClient();
      if (client) {
        const sessionKey = `ws:session:${userId}`;
        const sessionData = await client.get(sessionKey);
        
        if (sessionData) {
          const data = JSON.parse(sessionData);
          return data.serverNode;
        }
      }
    } catch (error) {
      console.warn('WebSocketPool: Failed to get user server from Redis:', error.message);
    }

    // Fallback to local
    const connection = this.connections.get(userId);
    return connection ? connection.serverNode : null;
  }

  /**
   * Get all users on a specific server
   * @param {string} serverId - Server identifier
   * @returns {Promise<Array>} Array of user IDs
   */
  async getServerUsers(serverId = this.serverId) {
    try {
      const client = await this._getRedisClient();
      if (client) {
        const serverKey = `ws:server:${serverId}`;
        return await client.sMembers(serverKey);
      }
    } catch (error) {
      console.warn('WebSocketPool: Failed to get server users from Redis:', error.message);
    }

    // Fallback to local
    return Array.from(this.connections.entries())
      .filter(([, conn]) => conn.serverNode === serverId)
      .map(([userId]) => userId);
  }

  /**
   * Prune dead connections (connections that haven't sent heartbeat)
   * @returns {Promise<Array>} Array of pruned user IDs
   */
  async pruneDeadConnections() {
    const now = Date.now();
    const pruned = [];

    for (const [userId, connection] of this.connections.entries()) {
      const elapsed = now - connection.lastHeartbeat;
      
      if (elapsed > this.heartbeatTimeout) {
        console.log(`WebSocketPool: Pruning dead connection for user ${userId} (no heartbeat for ${elapsed}ms)`);
        pruned.push(userId);
        
        // Close the WebSocket if possible
        if (connection.ws && typeof connection.ws.terminate === 'function') {
          connection.ws.terminate();
        }
        
        // Remove from tracking
        await this.unregister(userId);
      }
    }

    if (pruned.length > 0) {
      this.emit('connections:pruned', { userIds: pruned, count: pruned.length });
    }

    return pruned;
  }

  /**
   * Start the prune loop
   * @private
   */
  _startPruneLoop() {
    this.pruneTimer = setInterval(() => {
      this.pruneDeadConnections().catch(err => {
        console.error('WebSocketPool: Prune loop error:', err);
      });
    }, this.pruneInterval);

    // Don't prevent process exit
    if (this.pruneTimer.unref) {
      this.pruneTimer.unref();
    }
  }

  /**
   * Stop the prune loop
   * @private
   */
  _stopPruneLoop() {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  /**
   * Initiate graceful shutdown
   * Notifies all connected clients to reconnect
   * @param {number} timeout - Drain timeout in ms
   * @returns {Promise<Object>} Shutdown stats
   */
  async shutdown(timeout = DEFAULTS.drainTimeout) {
    console.log(`WebSocketPool: Initiating graceful shutdown (drain timeout: ${timeout}ms)`);
    this.shuttingDown = true;
    this.emit('shutdown:start', { timeout, connectionCount: this.connections.size });

    const startTime = Date.now();
    const notifiedUsers = [];

    // Notify all clients to reconnect
    for (const [userId, connection] of this.connections.entries()) {
      try {
        if (connection.ws && typeof connection.ws.send === 'function') {
          const message = JSON.stringify({
            type: 'server_shutdown',
            reason: 'graceful_shutdown',
            reconnect: true,
            serverNode: this.serverId
          });
          
          connection.ws.send(message);
          notifiedUsers.push(userId);
        }
      } catch (error) {
        console.warn(`WebSocketPool: Failed to notify user ${userId}:`, error.message);
      }
    }

    console.log(`WebSocketPool: Notified ${notifiedUsers.length} clients to reconnect`);

    // Wait for drain period
    await new Promise(resolve => setTimeout(resolve, timeout));

    // Close all remaining connections
    const closedCount = this.connections.size;
    for (const [userId, connection] of this.connections.entries()) {
      try {
        if (connection.ws && typeof connection.ws.close === 'function') {
          connection.ws.close(1001, 'Server shutting down');
        }
      } catch (error) {
        console.warn(`WebSocketPool: Failed to close connection for user ${userId}:`, error.message);
      }
    }

    // Clean up Redis entries
    try {
      const client = await this._getRedisClient();
      if (client) {
        const serverKey = `ws:server:${this.serverId}`;
        await client.del(serverKey);
      }
    } catch (error) {
      console.warn('WebSocketPool: Failed to clean up Redis entries:', error.message);
    }

    // Stop prune loop
    this._stopPruneLoop();

    const stats = {
      notifiedUsers: notifiedUsers.length,
      closedConnections: closedCount,
      duration: Date.now() - startTime
    };

    this.emit('shutdown:complete', stats);
    console.log(`WebSocketPool: Shutdown complete. Notified: ${stats.notifiedUsers}, Closed: ${stats.closedConnections}, Duration: ${stats.duration}ms`);

    return stats;
  }

  /**
   * Check if Redis is available
   * @returns {boolean}
   */
  isRedisAvailable() {
    return this.redisAvailable;
  }

  /**
   * Close the pool and clean up resources
   * @returns {Promise<void>}
   */
  async close() {
    this._stopPruneLoop();
    
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        console.warn('WebSocketPool: Failed to close Redis client:', error.message);
      }
      this.redisClient = null;
    }

    this.connections.clear();
    this.localConnections.clear();
    this.emit('pool:closed');
  }
}

/**
 * Create a WebSocket pool instance
 * @param {Object} options
 * @param {Object} options.redisClient - Optional Redis client
 * @param {number} options.heartbeatInterval - Heartbeat interval in ms
 * @param {string} options.serverId - Server identifier
 * @returns {WebSocketPool}
 */
function createWebSocketPool(options = {}) {
  return new WebSocketPool(options);
}

module.exports = {
  WebSocketPool,
  createWebSocketPool,
  DEFAULTS
};
