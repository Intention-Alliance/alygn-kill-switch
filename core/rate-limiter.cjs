/**
 * Token Bucket Rate Limiter
 * Implements the Token Bucket algorithm for API rate limiting
 * 
 * Features:
 * - Distributed state via Redis
 * - Multi-tier quotas (anonymous, authenticated, premium)
 * - Atomic operations with Lua scripts
 * - Configurable burst capacity
 */

// Redis is optional - will use local fallback if not available
let createClient;
try {
  ({ createClient } = require('redis'));
} catch (e) {
  createClient = null;
}

// Tier configuration (requests per minute)
const TIERS = {
  anonymous: { capacity: 10, refillRate: 10 / 60 },    // 10/min = ~0.167/sec
  authenticated: { capacity: 100, refillRate: 100 / 60 }, // 100/min = ~1.67/sec
  premium: { capacity: 1000, refillRate: 1000 / 60 }  // 1000/min = ~16.67/sec
};

// Redis key pattern: rate_limit:{client_id}:{endpoint}
const KEY_PREFIX = 'rate_limit';

// Lua script for atomic token bucket operations
// Returns: [allowed (0/1), remaining_tokens, retry_after_ms]
const LUA_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local requested = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

-- Get current bucket state
local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

-- Initialize bucket if empty
if tokens == nil then
  tokens = capacity
  last_refill = now
end

-- Calculate refill
local elapsed = (now - last_refill) / 1000
local refill = elapsed * refill_rate
tokens = math.min(capacity, tokens + refill)

-- Try to consume tokens
if tokens >= requested then
  tokens = tokens - requested
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
  redis.call('EXPIRE', key, 3600) -- 1 hour TTL
  return {1, tokens, 0}
else
  -- Calculate wait time until enough tokens available
  local needed = requested - tokens
  local wait_time = (needed / refill_rate) * 1000
  return {0, tokens, wait_time}
end
`;

class RedisTokenBucket {
  /**
   * @param {Object} options
   * @param {string} options.clientId - Unique client identifier
   * @param {string} options.endpoint - Endpoint identifier
   * @param {number} options.capacity - Max tokens in bucket
   * @param {number} options.refillRate - Tokens added per second
   * @param {Object} options.redisClient - Optional Redis client instance
   */
  constructor(options) {
    const { clientId, endpoint, capacity, refillRate, redisClient } = options;
    
    this.clientId = clientId;
    this.endpoint = endpoint;
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.redisClient = redisClient;
    this.key = `${KEY_PREFIX}:${clientId}:${endpoint}`;
  }

  /**
   * Get or create Redis client
   * @returns {Promise<Object>} Redis client
   */
  async getClient() {
    if (!this.redisClient) {
      this.redisClient = createClient();
      await this.redisClient.connect();
    }
    return this.redisClient;
  }

  /**
   * Consume tokens from the bucket
   * @param {number} tokens - Number of tokens to consume
   * @returns {Promise<{allowed: boolean, remaining: number, retryAfter: number}>}
   */
  async consume(tokens = 1) {
    const client = await this.getClient();
    const now = Date.now();

    try {
      const result = await client.eval(LUA_SCRIPT, {
        keys: [this.key],
        arguments: [this.capacity, this.refillRate, tokens, now]
      });

      const [allowed, remaining, retryAfter] = result;

      return {
        allowed: allowed === 1,
        remaining: Math.floor(remaining),
        retryAfter: Math.ceil(retryAfter / 1000) // Return in seconds
      };
    } catch (error) {
      // Fallback to local-only mode if Redis fails
      console.error('Redis error, falling back to local mode:', error.message);
      return this.consumeLocal(tokens);
    }
  }

  /**
   * Local fallback when Redis is unavailable
   * @param {number} tokens
   * @returns {Object}
   */
  consumeLocal(tokens = 1) {
    const now = Date.now();
    const elapsed = (now - (this.lastRefill || now)) / 1000;
    this.tokens = Math.min(
      this.capacity,
      (this.tokens || this.capacity) + elapsed * this.refillRate
    );
    this.lastRefill = now;

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return { allowed: true, remaining: Math.floor(this.tokens), retryAfter: 0 };
    }

    const needed = tokens - this.tokens;
    const waitTime = Math.ceil((needed / this.refillRate));

    return { allowed: false, remaining: Math.floor(this.tokens), retryAfter: waitTime };
  }

  /**
   * Reset the bucket (admin use)
   * @returns {Promise<void>}
   */
  async reset() {
    const client = await this.getClient();
    await client.del(this.key);
  }

  /**
   * Close Redis connection
   * @returns {Promise<void>}
   */
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }
  }
}

/**
 * Create a rate limiter for a specific client and endpoint
 * @param {Object} options
 * @param {string} options.clientId
 * @param {string} options.endpoint
 * @param {string} options.tier - 'anonymous' | 'authenticated' | 'premium'
 * @param {Object} options.redisClient
 * @returns {RedisTokenBucket}
 */
function createRateLimiter(options) {
  const { clientId, endpoint, tier = 'anonymous', redisClient } = options;
  const tierConfig = TIERS[tier] || TIERS.anonymous;

  return new RedisTokenBucket({
    clientId,
    endpoint,
    capacity: tierConfig.capacity,
    refillRate: tierConfig.refillRate,
    redisClient
  });
}

/**
 * Get tier configuration
 * @param {string} tier
 * @returns {Object}
 */
function getTierConfig(tier) {
  return TIERS[tier] || TIERS.anonymous;
}

/**
 * List all available tiers
 * @returns {string[]}
 */
function getTiers() {
  return Object.keys(TIERS);
}

module.exports = {
  RedisTokenBucket,
  createRateLimiter,
  getTierConfig,
  getTiers,
  TIERS,
  KEY_PREFIX
};
