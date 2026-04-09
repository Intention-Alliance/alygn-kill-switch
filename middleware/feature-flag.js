/**
 * Feature Flag Middleware for Express
 * 
 * Attaches req.flags for checking feature flags in routes.
 * 
 * Usage:
 *   const { featureFlagMiddleware, requireFlag } = require('./middleware/feature-flag');
 *   
 *   // Attach flags to all requests
 *   app.use(featureFlagMiddleware());
 *   
 *   // In route handler
 *   app.get('/api/data', (req, res) => {
 *     if (req.flags.isEnabled('vc-outreach-v2')) {
 *       // New feature
 *     } else {
 *       // Old feature
 *     }
 *   });
 *   
 *   // Require flag to access route
 *   app.get('/api/new-feature', requireFlag('vc-outreach-v2'), handler);
 */

const { FeatureFlagManager, isEnabled } = require('../core/feature-flags');

// Default configuration
const DEFAULT_CONFIG = {
  // Path to config file
  configPath: null,
  
  // How to get project from request
  getProject: (req) => req.project?.name || req.app?.get('project') || null,
  
  // How to get user ID from request
  getUserId: (req) => req.user?.id || req.userId || null,
  
  // How to get user groups from request
  getGroups: (req) => req.user?.groups || req.groups || [],
  
  // Custom context function (takes precedence)
  getContext: null,
  
  // Skip flag check for certain paths
  skipPaths: ['/health', '/ready', '/metrics'],
  
  // Key to attach flags helper on req
  attachKey: 'flags'
};

/**
 * Create feature flag middleware
 * @param {Object} config - Middleware configuration
 * @returns {Function} Express middleware
 */
function featureFlagMiddleware(config = {}) {
  const options = { ...DEFAULT_CONFIG, ...config };
  
  // Create manager instance
  const manager = new FeatureFlagManager({
    configPath: options.configPath,
    watchConfig: true
  });
  
  return function featureFlagHandler(req, res, next) {
    // Skip for excluded paths
    if (options.skipPaths.includes(req.path)) {
      return next();
    }
    
    // Build context
    let context;
    if (options.getContext) {
      context = options.getContext(req);
    } else {
      context = {
        project: options.getProject(req),
        userId: options.getUserId(req),
        groups: options.getGroups(req)
      };
    }
    
    // Attach flag helper to request
    req[options.attachKey] = {
      /**
       * Check if flag is enabled
       * @param {string} flagName
       * @param {Object} overrideContext
       * @returns {boolean}
       */
      isEnabled: (flagName, overrideContext = {}) => {
        return manager.isEnabled(flagName, { ...context, ...overrideContext });
      },
      
      /**
       * Get flag details
       * @param {string} flagName
       * @returns {Object|null}
       */
      getFlag: (flagName) => {
        return manager.getFlag(flagName);
      },
      
      /**
       * Get all flags
       * @returns {Object}
       */
      getAllFlags: () => {
        return manager.getAllFlags();
      },
      
      /**
       * Get current context
       * @returns {Object}
       */
      getContext: () => ({ ...context }),
      
      /**
       * Get manager instance
       * @returns {FeatureFlagManager}
       */
      getManager: () => manager
    };
    
    next();
  };
}

/**
 * Middleware to require a flag to be enabled
 * Returns 404 if flag is disabled (feature appears to not exist)
 * 
 * @param {string} flagName - Flag to check
 * @param {Object} options - Options
 * @param {number} options.statusCode - Status code when disabled (default: 404)
 * @param {string} options.message - Response message
 * @returns {Function} Express middleware
 */
function requireFlag(flagName, options = {}) {
  const { statusCode = 404, message = 'Not found' } = options;
  
  return function requireFlagHandler(req, res, next) {
    const flags = req.flags;
    
    if (!flags) {
      console.warn('Feature flag middleware not attached, skipping flag check');
      return next();
    }
    
    if (flags.isEnabled(flagName)) {
      return next();
    }
    
    // Flag disabled - return error
    return res.status(statusCode).json({
      error: message,
      code: 'FEATURE_DISABLED'
    });
  };
}

/**
 * Middleware to require a flag to be disabled (for feature rollback)
 * Returns 404 if flag is enabled
 * 
 * @param {string} flagName - Flag to check
 * @param {Object} options - Options
 * @returns {Function} Express middleware
 */
function requireFlagDisabled(flagName, options = {}) {
  const { statusCode = 404, message = 'Not found' } = options;
  
  return function requireFlagDisabledHandler(req, res, next) {
    const flags = req.flags;
    
    if (!flags) {
      return next();
    }
    
    if (!flags.isEnabled(flagName)) {
      return next();
    }
    
    return res.status(statusCode).json({
      error: message,
      code: 'FEATURE_ENABLED'
    });
  };
}

/**
 * Create a feature-gated route handler
 * @param {string} flagName - Flag to check
 * @param {Function} enabledHandler - Handler when flag is enabled
 * @param {Function} disabledHandler - Handler when flag is disabled
 * @returns {Function} Express middleware
 */
function featureGate(flagName, enabledHandler, disabledHandler) {
  return function featureGateHandler(req, res, next) {
    const flags = req.flags;
    
    if (!flags) {
      // No middleware attached, use disabled handler by default
      if (disabledHandler) {
        return disabledHandler(req, res, next);
      }
      return next(new Error('Feature flag middleware not attached'));
    }
    
    if (flags.isEnabled(flagName)) {
      return enabledHandler(req, res, next);
    }
    
    if (disabledHandler) {
      return disabledHandler(req, res, next);
    }
    
    // No disabled handler, return 404
    return res.status(404).json({
      error: 'Feature not available',
      code: 'FEATURE_DISABLED'
    });
  };
}

/**
 * Create middleware that sets context for all subsequent flag checks
 * @param {Object} context - Context to merge
 * @returns {Function} Express middleware
 */
function setFlagContext(context) {
  return function setFlagContextHandler(req, res, next) {
    if (req.flags && req.flags.getContext) {
      // Merge context into existing
      const existingContext = req.flags.getContext();
      Object.assign(existingContext, context);
    }
    next();
  };
}

module.exports = {
  featureFlagMiddleware,
  requireFlag,
  requireFlagDisabled,
  featureGate,
  setFlagContext,
  DEFAULT_CONFIG
};