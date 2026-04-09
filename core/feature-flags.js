/**
 * Feature Flag Manager
 * 
 * Centralized feature flag system for safe rollouts.
 * Supports: enable/disable, rollout percentages, project segmentation
 * 
 * Usage:
 *   const { FeatureFlagManager, isEnabled } = require('./core/feature-flags');
 *   
 *   const manager = new FeatureFlagManager('./config/feature-flags.json');
 *   if (manager.isEnabled('vc-outreach-v2', { project: 'alygn', userId: 'user123' })) {
 *     // New feature logic
 *   }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FeatureFlagManager {
  /**
   * @param {Object} options
   * @param {string} options.configPath - Path to feature flags config file
   * @param {boolean} options.watchConfig - Watch config file for changes (default: true)
   */
  constructor(options = {}) {
    const { configPath, watchConfig = true } = options;
    
    this.configPath = configPath || this.findConfigPath();
    this.flags = {};
    this.metadata = {};
    this.lastLoaded = null;
    
    // Load initial config
    this.loadConfig();
    
    // Watch for changes
    if (watchConfig && this.configPath) {
      this.watchConfig();
    }
  }

  /**
   * Find config file in standard locations
   * @returns {string|null}
   */
  findConfigPath() {
    const searchPaths = [
      path.join(process.cwd(), 'config', 'feature-flags.json'),
      path.join(process.cwd(), 'feature-flags.json'),
      path.join(__dirname, '..', 'config', 'feature-flags.json')
    ];
    
    for (const p of searchPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    
    return null;
  }

  /**
   * Load configuration from file
   * @returns {Object} Loaded flags
   */
  loadConfig(configPath = this.configPath) {
    if (!configPath || !fs.existsSync(configPath)) {
      console.warn('Feature flags config not found, using empty config');
      this.flags = {};
      this.metadata = { version: '0.0.0' };
      return this.flags;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(content);
      
      this.flags = config.flags || {};
      this.metadata = config.metadata || {};
      this.lastLoaded = Date.now();
      
      return this.flags;
    } catch (error) {
      console.error('Failed to load feature flags config:', error.message);
      return this.flags;
    }
  }

  /**
   * Watch config file for changes
   */
  watchConfig() {
    if (!this.configPath) return;
    
    try {
      fs.watchFile(this.configPath, { interval: 5000 }, () => {
        console.log('Feature flags config changed, reloading...');
        this.loadConfig();
      });
    } catch (error) {
      console.warn('Failed to watch config file:', error.message);
    }
  }

  /**
   * Stop watching config file
   */
  stopWatching() {
    if (this.configPath) {
      try {
        fs.unwatchFile(this.configPath);
      } catch (error) {
        // Ignore
      }
    }
  }

  /**
   * Hash a string to a number (0-99)
   * Used for consistent rollout percentage calculation
   * @param {string} str - String to hash
   * @returns {number} Hash value (0-99)
   */
  hash(str) {
    const hash = crypto.createHash('md5').update(str).digest('hex');
    // Use first 8 hex chars for numeric value
    const num = parseInt(hash.substring(0, 8), 16);
    return num % 100;
  }

  /**
   * Check if a feature flag is enabled
   * @param {string} flagName - Name of the flag
   * @param {Object} context - Evaluation context
   * @param {string} context.project - Project identifier
   * @param {string} context.userId - User identifier for percentage rollout
   * @param {string[]} context.groups - User groups for group-based flags
   * @returns {boolean} Whether the flag is enabled
   */
  isEnabled(flagName, context = {}) {
    const flag = this.flags[flagName];
    
    // Flag doesn't exist
    if (!flag) {
      return false;
    }
    
    // Flag is globally disabled
    if (!flag.enabled) {
      return false;
    }
    
    // Check project allowlist
    if (flag.allowedProjects && flag.allowedProjects.length > 0) {
      if (!context.project || !flag.allowedProjects.includes(context.project)) {
        return false;
      }
    }
    
    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
      const userId = context.userId || 'anonymous';
      const userHash = this.hash(userId);
      
      if (userHash >= flag.rolloutPercentage) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Get flag details
   * @param {string} flagName
   * @returns {Object|null}
   */
  getFlag(flagName) {
    return this.flags[flagName] || null;
  }

  /**
   * Get all flags
   * @returns {Object}
   */
  getAllFlags() {
    return { ...this.flags };
  }

  /**
   * Get flag metadata
   * @returns {Object}
   */
  getMetadata() {
    return { ...this.metadata };
  }

  /**
   * Enable a flag (in-memory only, use CLI for persistence)
   * @param {string} flagName
   */
  enable(flagName) {
    if (this.flags[flagName]) {
      this.flags[flagName].enabled = true;
    }
  }

  /**
   * Disable a flag (in-memory only, use CLI for persistence)
   * @param {string} flagName
   */
  disable(flagName) {
    if (this.flags[flagName]) {
      this.flags[flagName].enabled = false;
    }
  }

  /**
   * Set rollout percentage (in-memory only, use CLI for persistence)
   * @param {string} flagName
   * @param {number} percentage
   */
  setRollout(flagName, percentage) {
    if (this.flags[flagName]) {
      this.flags[flagName].rolloutPercentage = Math.min(100, Math.max(0, percentage));
    }
  }

  /**
   * Add project to allowlist (in-memory only)
   * @param {string} flagName
   * @param {string} project
   */
  addProject(flagName, project) {
    if (this.flags[flagName]) {
      if (!this.flags[flagName].allowedProjects) {
        this.flags[flagName].allowedProjects = [];
      }
      if (!this.flags[flagName].allowedProjects.includes(project)) {
        this.flags[flagName].allowedProjects.push(project);
      }
    }
  }

  /**
   * Remove project from allowlist (in-memory only)
   * @param {string} flagName
   * @param {string} project
   */
  removeProject(flagName, project) {
    if (this.flags[flagName] && this.flags[flagName].allowedProjects) {
      this.flags[flagName].allowedProjects = this.flags[flagName].allowedProjects.filter(
        p => p !== project
      );
    }
  }

  /**
   * Save current config to file
   * @param {string} configPath - Optional path override
   */
  save(configPath = this.configPath) {
    if (!configPath) {
      throw new Error('No config path specified');
    }

    const config = {
      flags: this.flags,
      metadata: {
        ...this.metadata,
        lastUpdated: new Date().toISOString(),
        updatedBy: process.env.USER || 'system'
      }
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    this.lastLoaded = Date.now();
  }

  /**
   * Create a new flag
   * @param {string} flagName
   * @param {Object} config
   */
  createFlag(flagName, config = {}) {
    this.flags[flagName] = {
      enabled: config.enabled ?? false,
      rolloutPercentage: config.rolloutPercentage ?? 0,
      allowedProjects: config.allowedProjects ?? [],
      description: config.description ?? ''
    };
  }

  /**
   * Delete a flag
   * @param {string} flagName
   */
  deleteFlag(flagName) {
    delete this.flags[flagName];
  }
}

// Singleton instance for convenience
let defaultManager = null;

/**
 * Get or create the default manager instance
 * @param {Object} options
 * @returns {FeatureFlagManager}
 */
function getManager(options = {}) {
  if (!defaultManager) {
    defaultManager = new FeatureFlagManager(options);
  }
  return defaultManager;
}

/**
 * Check if a flag is enabled (uses default manager)
 * @param {string} flagName
 * @param {Object} context
 * @returns {boolean}
 */
function isEnabled(flagName, context = {}) {
  return getManager().isEnabled(flagName, context);
}

/**
 * Get flag details (uses default manager)
 * @param {string} flagName
 * @returns {Object|null}
 */
function getFlag(flagName) {
  return getManager().getFlag(flagName);
}

/**
 * Get all flags (uses default manager)
 * @returns {Object}
 */
function getAllFlags() {
  return getManager().getAllFlags();
}

module.exports = {
  FeatureFlagManager,
  getManager,
  isEnabled,
  getFlag,
  getAllFlags
};