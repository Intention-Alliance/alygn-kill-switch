/**
 * WebSocket Pool Unit Tests
 * ADR-113: WebSocket Connection Pool and Lifecycle Management
 * 
 * Tests cover:
 * - Connect/disconnect flow
 * - Heartbeat pruning
 * - Redis failure (fail-open behavior)
 * - Graceful shutdown
 */

import { describe, it, beforeEach, afterEach, mock, expect } from 'bun:test';

// Mock Redis client
const mockRedisClient = {
  connect: mock(async () => {}),
  set: mock(async () => {}),
  get: mock(async () => null),
  del: mock(async () => {}),
  sAdd: mock(async () => {}),
  sRem: mock(async () => {}),
  sMembers: mock(async () => []),
  quit: mock(async () => {})
};

// Mock the redis module
mock.module('redis', () => ({
  createClient: mock(() => mockRedisClient)
}));

// Import after mocking
const { WebSocketPool, createWebSocketPool, DEFAULTS } = await import('../core/websocket-pool.js');
const { WebSocketLifecycle, createWebSocketLifecycle } = await import('../middleware/websocket-lifecycle.js');

// Mock WebSocket instance
function createMockWebSocket() {
  return {
    readyState: 1, // OPEN
    send: mock((data) => {}),
    close: mock((code, reason) => {}),
    terminate: mock(() => {}),
    ping: mock(() => {})
  };
}

describe('WebSocketPool', () => {
  let pool;
  let mockWs;

  beforeEach(() => {
    mockRedisClient.set.mockClear();
    mockRedisClient.get.mockClear();
    mockRedisClient.del.mockClear();
    mockRedisClient.sAdd.mockClear();
    mockRedisClient.sRem.mockClear();
    
    mockWs = createMockWebSocket();
  });

  afterEach(async () => {
    if (pool) {
      await pool.close();
      pool = null;
    }
  });

  describe('constructor', () => {
    it('should create pool with default options', () => {
      pool = createWebSocketPool();
      
      expect(pool).toBeDefined();
      expect(pool.heartbeatInterval).toBe(DEFAULTS.heartbeatInterval);
      expect(pool.heartbeatTimeout).toBe(DEFAULTS.heartbeatTimeout);
      expect(pool.pruneInterval).toBe(DEFAULTS.pruneInterval);
      expect(pool.serverId).toBeDefined();
      expect(pool.getConnectionCount()).toBe(0);
    });

    it('should create pool with custom options', () => {
      pool = createWebSocketPool({
        heartbeatInterval: 15000,
        heartbeatTimeout: 45000,
        pruneInterval: 30000,
        serverId: 'test-server-1'
      });

      expect(pool.heartbeatInterval).toBe(15000);
      expect(pool.heartbeatTimeout).toBe(45000);
      expect(pool.pruneInterval).toBe(30000);
      expect(pool.serverId).toBe('test-server-1');
    });
  });

  describe('register', () => {
    it('should register a new connection', async () => {
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      const result = await pool.register('user123', mockWs);
      
      expect(result).toBe(true);
      expect(pool.getConnectionCount()).toBe(1);
      expect(pool.getConnection('user123')).toBeDefined();
      expect(mockRedisClient.set).toHaveBeenCalled();
      expect(mockRedisClient.sAdd).toHaveBeenCalled();
    });

    it('should reject connection during shutdown', async () => {
      pool = createWebSocketPool();
      pool.shuttingDown = true;
      
      const result = await pool.register('user123', mockWs);
      
      expect(result).toBe(false);
      expect(pool.getConnectionCount()).toBe(0);
    });

    it('should fail-open when Redis is unavailable', async () => {
      // Simulate Redis failure
      mockRedisClient.set.mockRejectedValueOnce(new Error('Redis unavailable'));
      
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      const result = await pool.register('user123', mockWs);
      
      // Should still succeed with local fallback
      expect(result).toBe(true);
      expect(pool.getConnectionCount()).toBe(1);
      expect(pool.isRedisAvailable()).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should remove a connection', async () => {
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      await pool.register('user123', mockWs);
      expect(pool.getConnectionCount()).toBe(1);
      
      await pool.unregister('user123');
      
      expect(pool.getConnectionCount()).toBe(0);
      expect(pool.getConnection('user123')).toBeNull();
      expect(mockRedisClient.del).toHaveBeenCalled();
      expect(mockRedisClient.sRem).toHaveBeenCalled();
    });

    it('should handle unregistering non-existent user', async () => {
      pool = createWebSocketPool();
      
      // Should not throw
      expect(() => pool.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('heartbeat', () => {
    it('should update heartbeat timestamp', async () => {
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      await pool.register('user123', mockWs);
      const initialConnection = pool.getConnection('user123');
      const initialTime = initialConnection.lastHeartbeat;
      
      // Wait a bit then send heartbeat
      await new Promise(resolve => setTimeout(resolve, 5));
      await pool.heartbeat('user123');
      
      const updatedConnection = pool.getConnection('user123');
      expect(updatedConnection.lastHeartbeat).toBeGreaterThanOrEqual(initialTime);
    });

    it('should handle heartbeat for non-existent user', async () => {
      pool = createWebSocketPool();
      
      // Should not throw
      expect(() => pool.heartbeat('nonexistent')).not.toThrow();
    });
  });

  describe('pruneDeadConnections', () => {
    it('should prune connections that exceeded heartbeat timeout', async () => {
      pool = createWebSocketPool({ 
        redisClient: mockRedisClient,
        heartbeatTimeout: 50 // Very short timeout for testing
      });
      
      // Register a connection
      await pool.register('user123', mockWs);
      
      // Manually set lastHeartbeat to past
      const connection = pool.getConnection('user123');
      connection.lastHeartbeat = Date.now() - 100; // 100ms ago
      
      // Prune should remove it
      const pruned = await pool.pruneDeadConnections();
      
      expect(pruned).toContain('user123');
      expect(pool.getConnection('user123')).toBeNull();
      expect(mockWs.terminate).toHaveBeenCalled();
    });

    it('should not prune healthy connections', async () => {
      pool = createWebSocketPool({ 
        redisClient: mockRedisClient,
        heartbeatTimeout: 1000
      });
      
      await pool.register('user123', mockWs);
      
      // Prune immediately - connection should still be healthy
      const pruned = await pool.pruneDeadConnections();
      
      expect(pruned.length).toBe(0);
      expect(pool.getConnectionCount()).toBe(1);
    });
  });

  describe('getUserServer', () => {
    it('should return server node for registered user', async () => {
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      await pool.register('user123', mockWs);
      
      const serverNode = await pool.getUserServer('user123');
      expect(serverNode).toBe(pool.serverId);
    });

    it('should return null for unregistered user', async () => {
      pool = createWebSocketPool();
      
      const serverNode = await pool.getUserServer('nonexistent');
      expect(serverNode).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('should notify all clients and close connections', async () => {
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      
      await pool.register('user1', ws1);
      await pool.register('user2', ws2);
      
      const stats = await pool.shutdown(10); // 10ms drain
      
      expect(stats.notifiedUsers).toBe(2);
      expect(stats.closedConnections).toBe(2);
      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
      expect(ws1.close).toHaveBeenCalled();
      expect(ws2.close).toHaveBeenCalled();
      expect(pool.shuttingDown).toBe(true);
    });

    it('should handle shutdown with no connections', async () => {
      pool = createWebSocketPool();
      
      const stats = await pool.shutdown(10);
      
      expect(stats.notifiedUsers).toBe(0);
      expect(stats.closedConnections).toBe(0);
    });

    it('should emit shutdown events', async () => {
      pool = createWebSocketPool();
      
      const startHandler = mock(() => {});
      const completeHandler = mock(() => {});
      
      pool.on('shutdown:start', startHandler);
      pool.on('shutdown:complete', completeHandler);
      
      await pool.shutdown(10);
      
      expect(startHandler).toHaveBeenCalled();
      expect(completeHandler).toHaveBeenCalled();
    });
  });

  describe('events', () => {
    it('should emit connection:registered event', async () => {
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      const handler = mock(() => {});
      pool.on('connection:registered', handler);
      
      await pool.register('user123', mockWs);
      
      expect(handler).toHaveBeenCalledWith({
        userId: 'user123',
        serverNode: pool.serverId
      });
    });

    it('should emit connection:unregistered event', async () => {
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      await pool.register('user123', mockWs);
      
      const handler = mock(() => {});
      pool.on('connection:unregistered', handler);
      
      await pool.unregister('user123');
      
      expect(handler).toHaveBeenCalled();
    });

    it('should emit connections:pruned event', async () => {
      pool = createWebSocketPool({ heartbeatTimeout: 50 });
      
      await pool.register('user123', mockWs);
      
      // Make connection dead
      const connection = pool.getConnection('user123');
      connection.lastHeartbeat = Date.now() - 100;
      
      const handler = mock(() => {});
      pool.on('connections:pruned', handler);
      
      await pool.pruneDeadConnections();
      
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('fail-open behavior', () => {
    it('should continue operating when Redis fails', async () => {
      // Make Redis fail consistently
      mockRedisClient.set.mockRejectedValue(new Error('Redis down'));
      mockRedisClient.get.mockRejectedValue(new Error('Redis down'));
      
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      // Should still register locally
      const registerResult = await pool.register('user123', mockWs);
      expect(registerResult).toBe(true);
      expect(pool.getConnectionCount()).toBe(1);
      expect(pool.isRedisAvailable()).toBe(false);
      
      // Heartbeat should still work locally
      expect(() => pool.heartbeat('user123')).not.toThrow();
      
      // Unregister should work locally
      expect(() => pool.unregister('user123')).not.toThrow();
      expect(pool.getConnectionCount()).toBe(0);
    });

    it('should recover when Redis comes back', async () => {
      // First fail, then recover
      mockRedisClient.set.mockRejectedValueOnce(new Error('Redis down'));
      mockRedisClient.set.mockResolvedValueOnce('OK');
      
      pool = createWebSocketPool({ redisClient: mockRedisClient });
      
      // First registration fails Redis but succeeds locally
      await pool.register('user123', mockWs);
      expect(pool.isRedisAvailable()).toBe(false);
      
      // Reset mock to succeed
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.get.mockResolvedValue(JSON.stringify({ serverNode: pool.serverId }));
      
      // Next operation should recover
      await pool.heartbeat('user123');
      expect(pool.isRedisAvailable()).toBe(true);
    });
  });
});

describe('WebSocketLifecycle', () => {
  let pool;
  let lifecycle;
  let mockWs;

  beforeEach(() => {
    mockRedisClient.set.mockClear();
    pool = createWebSocketPool({ redisClient: mockRedisClient });
    lifecycle = createWebSocketLifecycle(pool);
    mockWs = createMockWebSocket();
  });

  afterEach(async () => {
    if (pool) {
      await pool.close();
    }
  });

  describe('onConnect', () => {
    it('should register connection and send ack', async () => {
      const result = await lifecycle.onConnect(mockWs, { userId: 'user123' });
      
      expect(result).toBe(true);
      expect(pool.getConnectionCount()).toBe(1);
      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should reject connection without userId', async () => {
      const result = await lifecycle.onConnect(mockWs, {});
      
      expect(result).toBe(false);
      expect(pool.getConnectionCount()).toBe(0);
    });

    it('should start auto-heartbeat if ws.ping available', async () => {
      expect(mockWs.ping).toBeDefined();
      
      await lifecycle.onConnect(mockWs, { userId: 'user123' });
      
      // Heartbeat interval should be set
      expect(lifecycle.heartbeatIntervals.has(mockWs)).toBe(true);
    });
  });

  describe('onDisconnect', () => {
    it('should unregister connection and stop heartbeat', async () => {
      await lifecycle.onConnect(mockWs, { userId: 'user123' });
      expect(pool.getConnectionCount()).toBe(1);
      
      await lifecycle.onDisconnect(mockWs);
      
      expect(pool.getConnectionCount()).toBe(0);
      expect(lifecycle.heartbeatIntervals.has(mockWs)).toBe(false);
    });

    it('should handle disconnect without prior connect', async () => {
      // Should not throw
      expect(() => lifecycle.onDisconnect(mockWs)).not.toThrow();
    });
  });

  describe('onHeartbeat', () => {
    it('should update heartbeat timestamp', async () => {
      await lifecycle.onConnect(mockWs, { userId: 'user123' });
      
      const initialConnection = pool.getConnection('user123');
      const initialTime = initialConnection.lastHeartbeat;
      
      await new Promise(resolve => setTimeout(resolve, 5));
      await lifecycle.onHeartbeat(mockWs);
      
      const updatedConnection = pool.getConnection('user123');
      expect(updatedConnection.lastHeartbeat).toBeGreaterThanOrEqual(initialTime);
    });
  });

  describe('onShutdown', () => {
    it('should stop heartbeats and shutdown pool', async () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      
      await lifecycle.onConnect(ws1, { userId: 'user1' });
      await lifecycle.onConnect(ws2, { userId: 'user2' });
      
      const stats = await lifecycle.onShutdown({ timeout: 10 });
      
      expect(stats.notifiedUsers).toBe(2);
      expect(lifecycle.heartbeatIntervals.size).toBe(0);
    });
  });

  describe('broadcast', () => {
    it('should send message to all connected users', async () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      
      await lifecycle.onConnect(ws1, { userId: 'user1' });
      await lifecycle.onConnect(ws2, { userId: 'user2' });
      
      const result = await lifecycle.broadcast({ type: 'test', data: 'hello' });
      
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);
      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    it('should exclude specified users from broadcast', async () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      
      await lifecycle.onConnect(ws1, { userId: 'user1' });
      await lifecycle.onConnect(ws2, { userId: 'user2' });
      
      const result = await lifecycle.broadcast(
        { type: 'test' },
        { excludeUsers: ['user1'] }
      );
      
      expect(result.sent).toBe(1);
    });
  });

  describe('sendToUser', () => {
    it('should send message to specific user', async () => {
      await lifecycle.onConnect(mockWs, { userId: 'user123' });
      
      const result = await lifecycle.sendToUser('user123', { type: 'test' });
      
      expect(result).toBe(true);
      expect(mockWs.send).toHaveBeenCalled();
    });

    it('should return false for non-existent user', async () => {
      const result = await lifecycle.sendToUser('nonexistent', { type: 'test' });
      
      expect(result).toBe(false);
    });
  });
});

describe('Integration: Connect/Disconnect Flow', () => {
  it('should handle full connection lifecycle', async () => {
    const pool = createWebSocketPool({ redisClient: mockRedisClient });
    const lifecycle = createWebSocketLifecycle(pool);
    const ws = createMockWebSocket();

    // Connect
    await lifecycle.onConnect(ws, { userId: 'user123' });
    expect(pool.getConnectionCount()).toBe(1);

    // Heartbeat
    await lifecycle.onHeartbeat(ws);
    const connection = pool.getConnection('user123');
    expect(connection).toBeDefined();

    // Disconnect
    await lifecycle.onDisconnect(ws);
    expect(pool.getConnectionCount()).toBe(0);

    await pool.close();
  });
});

describe('Integration: Graceful Shutdown Flow', () => {
  it('should notify clients and close all connections', async () => {
    const pool = createWebSocketPool({ redisClient: mockRedisClient });
    const lifecycle = createWebSocketLifecycle(pool);

    const clients = [];
    for (let i = 1; i <= 3; i++) {
      const ws = createMockWebSocket();
      await lifecycle.onConnect(ws, { userId: `user${i}` });
      clients.push(ws);
    }

    expect(pool.getConnectionCount()).toBe(3);

    const stats = await lifecycle.onShutdown({ timeout: 10 });

    expect(stats.notifiedUsers).toBe(3);
    expect(stats.closedConnections).toBe(3);
    expect(pool.shuttingDown).toBe(true);

    // All clients should have received shutdown message
    for (const ws of clients) {
      expect(ws.send).toHaveBeenCalled();
      expect(ws.close).toHaveBeenCalled();
    }

    await pool.close();
  });
});
