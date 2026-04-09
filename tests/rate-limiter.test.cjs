/**
 * Rate Limiter Tests
 * 
 * Tests for Token Bucket implementation and Redis integration
 * 
 * Run with: node tests/rate-limiter.test.js
 */

const assert = require('assert');

// Mock Redis client for testing
class MockRedisClient {
  constructor() {
    this.store = new Map();
    this.connected = true;
    this.shouldFail = false;
  }

  async connect() {
    this.connected = true;
    return this;
  }

  async eval(script, { keys, arguments: args }) {
    if (this.shouldFail) {
      throw new Error('Redis connection failed');
    }

    const [key] = keys;
    const [capacity, refillRate, requested, now] = args.map(Number);

    // Get current bucket state
    let bucket = this.store.get(key) || { tokens: capacity, lastRefill: now };
    
    // Calculate refill
    const elapsed = (now - bucket.lastRefill) / 1000;
    const refill = elapsed * refillRate;
    bucket.tokens = Math.min(capacity, bucket.tokens + refill);

    // Try to consume tokens
    if (bucket.tokens >= requested) {
      bucket.tokens -= requested;
      this.store.set(key, bucket);
      return [1, Math.floor(bucket.tokens), 0];
    } else {
      const needed = requested - bucket.tokens;
      const waitTime = Math.ceil((needed / refillRate) * 1000);
      return [0, Math.floor(bucket.tokens), waitTime];
    }
  }

  async del(key) {
    this.store.delete(key);
  }

  async quit() {
    this.connected = false;
  }

  setFailure(shouldFail) {
    this.shouldFail = shouldFail;
  }

  getStoredData(key) {
    return this.store.get(key);
  }
}

// Test helpers
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  fn();
}

// Load the rate limiter
const {
  RedisTokenBucket,
  createRateLimiter,
  getTierConfig,
  getTiers,
  TIERS
} = require('../core/rate-limiter.cjs');

// Tests
describe('Token Bucket Core', () => {
  test('should initialize with full capacity', () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 10,
      refillRate: 1,
      redisClient: mockRedis
    });

    assert.strictEqual(bucket.capacity, 10);
    assert.strictEqual(bucket.refillRate, 1);
    assert.strictEqual(bucket.key, 'rate_limit:test-client:/api/test');
  });

  test('should consume tokens when available', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 10,
      refillRate: 1,
      redisClient: mockRedis
    });

    const result = await bucket.consume(1);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 9);
    assert.strictEqual(result.retryAfter, 0);
  });

  test('should deny when tokens exhausted', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 2,
      refillRate: 0.1, // Very slow refill for testing
      redisClient: mockRedis
    });

    // Exhaust the bucket
    await bucket.consume(1);
    await bucket.consume(1);

    // Should be denied
    const result = await bucket.consume(1);
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.remaining, 0);
    assert(result.retryAfter > 0);
  });

  test('should refill tokens over time', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 10,
      refillRate: 10, // 10 tokens per second
      redisClient: mockRedis
    });

    // Consume some tokens
    await bucket.consume(5);
    let result = await bucket.consume(1);
    assert.strictEqual(result.remaining, 4);

    // Wait 500ms and check refill (should have ~5 more tokens)
    await new Promise(resolve => setTimeout(resolve, 500));
    result = await bucket.consume(1);
    assert(result.remaining >= 8); // Should have refilled
  });

  test('should not exceed capacity', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 5,
      refillRate: 100, // Very fast refill
      redisClient: mockRedis
    });

    // Wait for potential over-refill
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const result = await bucket.consume(1);
    assert(result.remaining <= 5); // Should never exceed capacity
  });

  test('should consume multiple tokens at once', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 10,
      refillRate: 1,
      redisClient: mockRedis
    });

    const result = await bucket.consume(3);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 7);
  });

  test('should fail open when Redis errors', async () => {
    const mockRedis = new MockRedisClient();
    mockRedis.setFailure(true);

    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 10,
      refillRate: 1,
      redisClient: mockRedis
    });

    const result = await bucket.consume(1);
    // Should fail open (allow request)
    assert.strictEqual(result.allowed, true);
  });
});

describe('Tier Configuration', () => {
  test('should return correct config for anonymous tier', () => {
    const config = getTierConfig('anonymous');
    assert.strictEqual(config.capacity, 10);
    assert.strictEqual(config.refillRate, 10 / 60);
  });

  test('should return correct config for authenticated tier', () => {
    const config = getTierConfig('authenticated');
    assert.strictEqual(config.capacity, 100);
    assert.strictEqual(config.refillRate, 100 / 60);
  });

  test('should return correct config for premium tier', () => {
    const config = getTierConfig('premium');
    assert.strictEqual(config.capacity, 1000);
    assert.strictEqual(config.refillRate, 1000 / 60);
  });

  test('should default to anonymous for unknown tier', () => {
    const config = getTierConfig('unknown');
    assert.strictEqual(config.capacity, 10);
  });

  test('should list all available tiers', () => {
    const tiers = getTiers();
    assert.deepStrictEqual(tiers, ['anonymous', 'authenticated', 'premium']);
  });
});

describe('createRateLimiter Factory', () => {
  test('should create limiter with correct tier settings', () => {
    const mockRedis = new MockRedisClient();
    const limiter = createRateLimiter({
      clientId: 'client1',
      endpoint: '/api/data',
      tier: 'authenticated',
      redisClient: mockRedis
    });

    assert.strictEqual(limiter.capacity, 100);
    assert.strictEqual(limiter.refillRate, 100 / 60);
  });

  test('should default to anonymous tier', () => {
    const mockRedis = new MockRedisClient();
    const limiter = createRateLimiter({
      clientId: 'client1',
      endpoint: '/api/data',
      redisClient: mockRedis
    });

    assert.strictEqual(limiter.capacity, 10);
  });
});

describe('Redis Integration', () => {
  test('should generate correct key format', () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'user123',
      endpoint: '/api/users',
      capacity: 10,
      refillRate: 1,
      redisClient: mockRedis
    });

    assert.strictEqual(bucket.key, 'rate_limit:user123:/api/users');
  });

  test('should reset bucket state', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 10,
      refillRate: 1,
      redisClient: mockRedis
    });

    // Consume some tokens
    await bucket.consume(3);

    // Reset
    await bucket.reset();

    // Bucket should be fresh
    const result = await bucket.consume(1);
    assert.strictEqual(result.remaining, 9); // Full capacity
  });

  test('should handle concurrent requests', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 5,
      refillRate: 0,
      redisClient: mockRedis
    });

    // Make multiple concurrent requests
    const results = await Promise.all([
      bucket.consume(1),
      bucket.consume(1),
      bucket.consume(1),
      bucket.consume(1),
      bucket.consume(1)
    ]);

    // First 5 should succeed
    const allowed = results.filter(r => r.allowed);
    assert(allowed.length <= 5);
  });
});

describe('Edge Cases', () => {
  test('should handle zero refill rate', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 3,
      refillRate: 0,
      redisClient: mockRedis
    });

    await bucket.consume(1);
    await bucket.consume(1);
    
    const result = await bucket.consume(1);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 0);

    // Next should fail
    const denied = await bucket.consume(1);
    assert.strictEqual(denied.allowed, false);
  });

  test('should handle very large capacity requests', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 100,
      refillRate: 10,
      redisClient: mockRedis
    });

    const result = await bucket.consume(50);
    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 50);
  });

  test('should calculate retry time correctly', async () => {
    const mockRedis = new MockRedisClient();
    const bucket = new RedisTokenBucket({
      clientId: 'test-client',
      endpoint: '/api/test',
      capacity: 1,
      refillRate: 1, // 1 token per second
      redisClient: mockRedis
    });

    // Exhaust the only token
    await bucket.consume(1);

    // Request another - should fail with retry time
    const result = await bucket.consume(1);
    assert.strictEqual(result.allowed, false);
    assert(result.retryAfter >= 1); // At least 1 second
  });
});

// Test middleware integration
describe('Middleware Integration (Mock)', () => {
  test('should create middleware with default options', () => {
    const { rateLimitMiddleware } = require('../middleware/rate-limit.cjs');
    const middleware = rateLimitMiddleware();
    
    assert.strictEqual(typeof middleware, 'function');
    assert.strictEqual(middleware.length, 3); // req, res, next
  });

  test('should create middleware with custom tier', () => {
    const { tierMiddleware } = require('../middleware/rate-limit.cjs');
    const middleware = tierMiddleware('premium');
    
    assert.strictEqual(typeof middleware, 'function');
  });

  test('should create custom limit middleware', () => {
    const { customMiddleware } = require('../middleware/rate-limit.cjs');
    const middleware = customMiddleware(50, 5);
    
    assert.strictEqual(typeof middleware, 'function');
  });
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
