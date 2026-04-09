/**
 * Rate Limiting Middleware for Express
 * 
 * Integrates the Token Bucket rate limiter into Express routes.
 * 
 * Usage:
 *   const { rateLimitMiddleware } = require('./middleware/rate-limit');
 *   
 *   // Apply to all routes
 *   app.use(rateLimitMiddleware());
 *   
 *   // Apply to specific routes
 *   app.get('/api/data', rateLimitMiddleware({ tier: 'authenticated' }), handler);
 */

const { createRateLimiter, getTierConfig } = require('../core/rate-limiter.cjs');

// Default configuration
const DEFAULT_CONFIG = {
  // How to identify clients: 'user', 'ip', or 'custom'
  identifierType: 'ip',
  
  // Custom identifier function (req => string)
  // Takes precedence over identifierType if provided
  getIdentifier: null,
  
  // Default tier for unauthenticated requests
  defaultTier: 'anonymous',
  
  // Endpoint identification: 'path', 'method', or 'custom'
  endpointType: 'path',
  
  // Custom endpoint key function
  getEndpoint: null,
  
  // Redis client (optional, will use local fallback if not provided)
  redisClient: null,
  
  // Skip rate limiting for certain paths
  skipPaths: ['/health', '/ready'],
  
  // Add rate limit headers
  addHeaders: true,
  
  // Custom error message
  errorMessage: 'Rate limit exceeded. Please try again later.',
  
  // Custom 429 status code message
  errorCode: 429
};

/**
 * Create rate limit middleware with configuration
 * @param {Object} config - Middleware configuration
 * @returns {Function} Express middleware
 */
function rateLimitMiddleware(config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };

  return async function rateLimitHandler(req, res, next) {
    // Check if path should be skipped
    if (options.skipPaths.includes(req.path)) {
      return next();
    }

    try {
      // Determine client identifier
      let clientId;
      if (options.getIdentifier) {
        clientId = options.getIdentifier(req);
      } else if (options.identifierType === 'user' && req.user?.id) {
        clientId = `user:${req.user.id}`;
      } else {
        clientId = `ip:${req.ip || req.connection.remoteAddress}`;
      }

      // Determine endpoint key
      let endpoint;
      if (options.getEndpoint) {
        endpoint = options.getEndpoint(req);
      } else if (options.endpointType === 'method') {
        endpoint = `${req.method}:${req.path}`;
      } else {
        endpoint = req.path;
      }

      // Determine tier
      const tier = req.user?.tier || options.defaultTier;
      const tierConfig = getTierConfig(tier);

      // Create rate limiter
      const limiter = createRateLimiter({
        clientId,
        endpoint,
        tier,
        redisClient: options.redisClient
      });

      // Consume token
      const result = await limiter.consume(1);

      // Add rate limit headers
      if (options.addHeaders) {
        res.setHeader('X-RateLimit-Limit', tierConfig.capacity);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(Date.now() / 1000) + (result.retryAfter || 0));
        
        if (!result.allowed) {
          res.setHeader('Retry-After', result.retryAfter);
        }
      }

      // Check if allowed
      if (!result.allowed) {
        return res.status(options.errorCode).json({
          error: options.errorMessage,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: result.retryAfter
        });
      }

      next();
    } catch (error) {
      // On error, allow request (fail open) but log
      console.error('Rate limiter error:', error);
      next();
    }
  };
}

/**
 * Create middleware for a specific tier
 * @param {string} tier - 'anonymous', 'authenticated', or 'premium'
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 */
function tierMiddleware(tier, options = {}) {
  return rateLimitMiddleware({ ...options, defaultTier: tier });
}

/**
 * Create middleware with custom limits
 * @param {number} capacity - Max requests
 * @param {number} refillRate - Requests per second
 * @param {Object} options - Additional options
 * @returns {Function} Express middleware
 */
function customMiddleware(capacity, refillRate, options = {}) {
  return async function customLimitHandler(req, res, next) {
    try {
      let clientId;
      if (options.getIdentifier) {
        clientId = options.getIdentifier(req);
      } else {
        clientId = `ip:${req.ip || req.connection.remoteAddress}`;
      }

      let endpoint;
      if (options.getEndpoint) {
        endpoint = options.getEndpoint(req);
      } else {
        endpoint = req.path;
      }

      const { RedisTokenBucket } = require('../core/rate-limiter.cjs');
      const limiter = new RedisTokenBucket({
        clientId,
        endpoint,
        capacity,
        refillRate,
        redisClient: options.redisClient
      });

      const result = await limiter.consume(1);

      if (options.addHeaders !== false) {
        res.setHeader('X-RateLimit-Limit', capacity);
        res.setHeader('X-RateLimit-Remaining', result.remaining);
        
        if (!result.allowed) {
          res.setHeader('Retry-After', result.retryAfter);
        }
      }

      if (!result.allowed) {
        return res.status(429).json({
          error: options.errorMessage || 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: result.retryAfter
        });
      }

      next();
    } catch (error) {
      console.error('Custom rate limiter error:', error);
      next();
    }
  };
}

module.exports = {
  rateLimitMiddleware,
  tierMiddleware,
  customMiddleware,
  DEFAULT_CONFIG
};
