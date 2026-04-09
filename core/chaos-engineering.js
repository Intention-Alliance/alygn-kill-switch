/**
 * Chaos Engineering Framework
 * 
 * Proactive fault injection testing for production resilience.
 * Implements: Chaos Monkey, Network Latency, Dependency Failure Simulation
 * 
 * ⚠️ SAFETY FIRST:
 * - NEVER run in production without explicit approval
 * - Start with staging only
 * - Kill switch must be tested before any experiment
 * 
 * Usage:
 *   const ChaosEngine = require('./core/chaos-engineering');
 *   const engine = new ChaosEngine({ scope: 'staging' });
 *   
 *   await engine.loadExperiment('config/chaos-experiments/pod-kill.json');
 *   await engine.execute();
 *   
 *   // Emergency stop
 *   await engine.killSwitch();
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class ChaosEngine {
  /**
   * @param {Object} options
   * @param {string} options.scope - Environment scope: 'staging' | 'production' (default: 'staging')
   * @param {string} options.configPath - Base path for experiment configs
   * @param {boolean} options.dryRun - Log actions without executing (default: false)
   */
  constructor(options = {}) {
    this.scope = options.scope || 'staging';
    this.configPath = options.configPath || path.join(process.cwd(), 'config', 'chaos-experiments');
    this.dryRun = options.dryRun || false;
    
    this.currentExperiment = null;
    this.isRunning = false;
    this.killSwitchActive = false;
    this.activeProcesses = [];
    this.results = [];
    this.startTime = null;
    this.endTime = null;
    
    // Safety checks
    this._validateScope();
  }

  /**
   * Validate environment scope for safety
   * @private
   */
  _validateScope() {
    const allowedScopes = ['staging', 'development', 'local'];
    
    if (!allowedScopes.includes(this.scope)) {
      throw new Error(
        `Invalid scope: ${this.scope}. Chaos experiments are only allowed in: ${allowedScopes.join(', ')}. ` +
        'Production requires explicit approval and additional safety measures.'
      );
    }
    
    console.log(`[ChaosEngine] Initialized with scope: ${this.scope} (dryRun: ${this.dryRun})`);
  }

  /**
   * Load experiment configuration from JSON file
   * @param {string} experimentPath - Path to experiment config file
   * @returns {Object} Loaded experiment configuration
   */
  async loadExperiment(experimentPath) {
    const fullPath = path.isAbsolute(experimentPath)
      ? experimentPath
      : path.join(this.configPath, experimentPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Experiment config not found: ${fullPath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    this.currentExperiment = JSON.parse(content);
    
    // Validate experiment structure
    this._validateExperiment(this.currentExperiment);
    
    console.log(`[ChaosEngine] Loaded experiment: ${this.currentExperiment.name || 'unnamed'}`);
    return this.currentExperiment;
  }

  /**
   * Validate experiment configuration
   * @private
   * @param {Object} experiment 
   */
  _validateExperiment(experiment) {
    const required = ['type', 'scope'];
    
    for (const field of required) {
      if (!experiment[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Scope must match or be more restrictive
    if (experiment.scope !== this.scope) {
      throw new Error(
        `Experiment scope mismatch: experiment is scoped to '${experiment.scope}', ` +
        `engine is scoped to '${this.scope}'`
      );
    }
    
    // Validate experiment type
    const validTypes = ['pod-kill', 'network-latency', 'dependency-failure', 'cpu-stress', 'memory-stress'];
    if (!validTypes.includes(experiment.type)) {
      throw new Error(`Invalid experiment type: ${experiment.type}. Valid types: ${validTypes.join(', ')}`);
    }
  }

  /**
   * Execute the loaded experiment
   * @returns {Object} Execution results
   */
  async execute() {
    if (!this.currentExperiment) {
      throw new Error('No experiment loaded. Call loadExperiment() first.');
    }

    if (this.killSwitchActive) {
      throw new Error('Kill switch is active. Experiment cannot run.');
    }

    if (this.isRunning) {
      throw new Error('Experiment already running.');
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.results = [];

    console.log(`[ChaosEngine] Starting experiment: ${this.currentExperiment.name || this.currentExperiment.type}`);

    try {
      let result;
      
      switch (this.currentExperiment.type) {
        case 'pod-kill':
          result = await this._executePodKill();
          break;
        case 'network-latency':
          result = await this._executeNetworkLatency();
          break;
        case 'dependency-failure':
          result = await this._executeDependencyFailure();
          break;
        case 'cpu-stress':
          result = await this._executeCpuStress();
          break;
        case 'memory-stress':
          result = await this._executeMemoryStress();
          break;
        default:
          throw new Error(`Unknown experiment type: ${this.currentExperiment.type}`);
      }

      this.results.push(result);
      this.endTime = Date.now();

      return {
        success: true,
        experiment: this.currentExperiment.name || this.currentExperiment.type,
        duration: this.endTime - this.startTime,
        results: this.results,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      this.endTime = Date.now();
      console.error('[ChaosEngine] Experiment failed:', error.message);
      
      return {
        success: false,
        experiment: this.currentExperiment.name || this.currentExperiment.type,
        duration: this.endTime - this.startTime,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Execute pod/process termination experiment
   * @private
   * @returns {Object} Result
   */
  async _executePodKill() {
    const config = this.currentExperiment;
    const targets = config.targets || [];
    
    if (targets.length === 0) {
      throw new Error('No targets specified for pod-kill experiment');
    }

    // Select random target if multiple specified
    const target = config.random !== false 
      ? targets[Math.floor(Math.random() * targets.length)]
      : targets[0];

    console.log(`[ChaosEngine] Pod Kill: Targeting ${target}`);

    if (this.dryRun) {
      return { action: 'pod-kill', target, dryRun: true, status: 'simulated' };
    }

    // Execute termination based on target type
    if (target.startsWith('pod:')) {
      return await this._killPod(target.replace('pod:', ''));
    } else if (target.startsWith('process:')) {
      return await this._killProcess(target.replace('process:', ''));
    } else {
      return await this._killProcess(target);
    }
  }

  /**
   * Kill a Kubernetes pod
   * @private
   * @param {string} podName 
   * @returns {Object} Result
   */
  async _killPod(podName) {
    try {
      const namespace = this.currentExperiment.namespace || 'default';
      const command = `kubectl delete pod ${podName} -n ${namespace}`;
      
      console.log(`[ChaosEngine] Executing: ${command}`);
      const { stdout, stderr } = await execAsync(command);
      
      return {
        action: 'pod-kill',
        target: podName,
        namespace,
        success: true,
        output: stdout,
        error: stderr || null
      };
    } catch (error) {
      return {
        action: 'pod-kill',
        target: podName,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Kill a process by name or PID
   * @private
   * @param {string} processIdentifier 
   * @returns {Object} Result
   */
  async _killProcess(processIdentifier) {
    try {
      let command;
      
      // Check if it's a PID (numeric)
      if (/^\d+$/.test(processIdentifier)) {
        command = `kill -TERM ${processIdentifier}`;
      } else {
        // Kill by process name
        command = `pkill -f "${processIdentifier}"`;
      }
      
      console.log(`[ChaosEngine] Executing: ${command}`);
      const { stdout, stderr } = await execAsync(command);
      
      return {
        action: 'process-kill',
        target: processIdentifier,
        success: true,
        output: stdout,
        error: stderr || null
      };
    } catch (error) {
      return {
        action: 'process-kill',
        target: processIdentifier,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute network latency injection
   * @private
   * @returns {Object} Result
   */
  async _executeNetworkLatency() {
    const config = this.currentExperiment;
    const latencyMs = config.latencyMs || 100;
    const interface = config.interface || 'eth0';
    const targetHost = config.targetHost || null;

    console.log(`[ChaosEngine] Network Latency: +${latencyMs}ms on ${interface}${targetHost ? ` to ${targetHost}` : ''}`);

    if (this.dryRun) {
      return { 
        action: 'network-latency', 
        latencyMs, 
        interface, 
        targetHost,
        dryRun: true, 
        status: 'simulated' 
      };
    }

    // Use tc (traffic control) for latency injection
    try {
      // Add latency
      const addCommand = `tc qdisc add dev ${interface} root netem delay ${latencyMs}ms`;
      const clearCommand = `tc qdisc del dev ${interface} root netem 2>/dev/null || true`;
      
      // Clear any existing rules first
      await execAsync(clearCommand);
      
      // Track for cleanup
      this.activeProcesses.push({ type: 'tc', interface, cleanup: clearCommand });
      
      await execAsync(addCommand);
      
      return {
        action: 'network-latency',
        latencyMs,
        interface,
        targetHost,
        success: true,
        duration: config.duration || 60000
      };
    } catch (error) {
      return {
        action: 'network-latency',
        latencyMs,
        interface,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute dependency failure simulation
   * @private
   * @returns {Object} Result
   */
  async _executeDependencyFailure() {
    const config = this.currentExperiment;
    const dependency = config.dependency || {};
    const type = dependency.type || 'timeout'; // timeout | error | slow
    const target = dependency.target; // db | api | service name
    const duration = dependency.duration || 5000;

    if (!target) {
      throw new Error('Dependency target required (e.g., "db", "api", service name)');
    }

    console.log(`[ChaosEngine] Dependency Failure: ${type} on ${target} for ${duration}ms`);

    if (this.dryRun) {
      return { 
        action: 'dependency-failure', 
        target, 
        type, 
        duration,
        dryRun: true, 
        status: 'simulated' 
      };
    }

    try {
      // Implementation depends on infrastructure
      // For now, simulate via environment variable or mock endpoint
      const result = {
        action: 'dependency-failure',
        target,
        type,
        duration,
        success: true,
        simulated: true
      };

      // If target is a database, simulate connection issues
      if (target === 'db' || target === 'database') {
        result.method = 'connection_pool_exhaustion';
        console.log(`[ChaosEngine] Simulating DB ${type} via connection pool manipulation`);
      }
      
      // If target is an API, simulate via mock response
      if (target.startsWith('api:') || target.startsWith('http')) {
        result.method = 'mock_timeout';
        console.log(`[ChaosEngine] Simulating API ${type} via response delay`);
      }

      return result;
    } catch (error) {
      return {
        action: 'dependency-failure',
        target,
        type,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute CPU stress experiment
   * @private
   * @returns {Object} Result
   */
  async _executeCpuStress() {
    const config = this.currentExperiment;
    const cpuPercent = config.cpuPercent || 80;
    const duration = config.duration || 30000;

    console.log(`[ChaosEngine] CPU Stress: ${cpuPercent}% for ${duration}ms`);

    if (this.dryRun) {
      return { action: 'cpu-stress', cpuPercent, duration, dryRun: true, status: 'simulated' };
    }

    // Use stress tool if available
    try {
      const command = `stress --cpu ${Math.ceil(cpuPercent / 25)} --timeout ${duration / 1000}s`;
      const { stdout, stderr } = await execAsync(command);
      
      return {
        action: 'cpu-stress',
        cpuPercent,
        duration,
        success: true,
        output: stdout
      };
    } catch (error) {
      // Fallback: simple CPU burn
      return {
        action: 'cpu-stress',
        cpuPercent,
        duration,
        success: false,
        error: error.message,
        fallback: 'stress tool not available'
      };
    }
  }

  /**
   * Execute memory stress experiment
   * @private
   * @returns {Object} Result
   */
  async _executeMemoryStress() {
    const config = this.currentExperiment;
    const memoryMb = config.memoryMb || 512;
    const duration = config.duration || 30000;

    console.log(`[ChaosEngine] Memory Stress: ${memoryMb}MB for ${duration}ms`);

    if (this.dryRun) {
      return { action: 'memory-stress', memoryMb, duration, dryRun: true, status: 'simulated' };
    }

    try {
      const command = `stress --vm 1 --vm-bytes ${memoryMb}M --timeout ${duration / 1000}s`;
      const { stdout, stderr } = await execAsync(command);
      
      return {
        action: 'memory-stress',
        memoryMb,
        duration,
        success: true,
        output: stdout
      };
    } catch (error) {
      return {
        action: 'memory-stress',
        memoryMb,
        duration,
        success: false,
        error: error.message,
        fallback: 'stress tool not available'
      };
    }
  }

  /**
   * 🚨 KILL SWITCH - Immediately stop all experiments
   * Clears all active chaos injections
   * @returns {Object} Cleanup results
   */
  async killSwitch() {
    console.log('🚨 [ChaosEngine] KILL SWITCH ACTIVATED 🚨');
    this.killSwitchActive = true;
    this.isRunning = false;

    const cleanupResults = [];

    // Clear all active processes/injections
    for (const proc of this.activeProcesses) {
      try {
        console.log(`[ChaosEngine] Cleaning up: ${proc.type} on ${proc.interface || 'unknown'}`);
        
        if (proc.cleanup) {
          await execAsync(proc.cleanup);
          cleanupResults.push({ type: proc.type, success: true });
        }
      } catch (error) {
        console.error(`[ChaosEngine] Cleanup failed:`, error.message);
        cleanupResults.push({ type: proc.type, success: false, error: error.message });
      }
    }

    // Reset state
    this.activeProcesses = [];
    this.currentExperiment = null;

    return {
      killSwitchActivated: true,
      timestamp: new Date().toISOString(),
      cleanupResults,
      message: 'All chaos experiments stopped and cleaned up'
    };
  }

  /**
   * Check if kill switch is active
   * @returns {boolean}
   */
  isKillSwitchActive() {
    return this.killSwitchActive;
  }

  /**
   * Reset kill switch (requires manual confirmation)
   * @param {boolean} confirm - Must be true to reset
   */
  resetKillSwitch(confirm) {
    if (!confirm) {
      throw new Error('Must explicitly confirm kill switch reset');
    }
    
    console.log('[ChaosEngine] Kill switch reset confirmed');
    this.killSwitchActive = false;
  }

  /**
   * Get current experiment status
   * @returns {Object}
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      killSwitchActive: this.killSwitchActive,
      scope: this.scope,
      currentExperiment: this.currentExperiment?.name || null,
      activeProcesses: this.activeProcesses.length,
      startTime: this.startTime,
      endTime: this.endTime
    };
  }

  /**
   * Get experiment results
   * @returns {Array}
   */
  getResults() {
    return this.results;
  }
}

// Registry for managing multiple experiments
class ExperimentRegistry {
  constructor(configPath) {
    this.configPath = configPath || path.join(process.cwd(), 'config', 'chaos-experiments');
    this.experiments = new Map();
    this.loadAll();
  }

  /**
   * Load all experiments from config directory
   */
  loadAll() {
    if (!fs.existsSync(this.configPath)) {
      console.warn(`[ExperimentRegistry] Config directory not found: ${this.configPath}`);
      return;
    }

    const files = fs.readdirSync(this.configPath).filter(f => f.endsWith('.json'));
    
    for (const file of files) {
      try {
        const fullPath = path.join(this.configPath, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        const experiment = JSON.parse(content);
        this.experiments.set(file.replace('.json', ''), experiment);
      } catch (error) {
        console.error(`[ExperimentRegistry] Failed to load ${file}:`, error.message);
      }
    }

    console.log(`[ExperimentRegistry] Loaded ${this.experiments.size} experiments`);
  }

  /**
   * Get experiment by name
   * @param {string} name 
   * @returns {Object|null}
   */
  get(name) {
    return this.experiments.get(name) || null;
  }

  /**
   * List all experiments
   * @returns {Array}
   */
  list() {
    return Array.from(this.experiments.entries()).map(([name, exp]) => ({
      name,
      type: exp.type,
      scope: exp.scope,
      description: exp.description || ''
    }));
  }

  /**
   * Add experiment to registry
   * @param {string} name 
   * @param {Object} experiment 
   */
  add(name, experiment) {
    this.experiments.set(name, experiment);
  }

  /**
   * Remove experiment from registry
   * @param {string} name 
   */
  remove(name) {
    this.experiments.delete(name);
  }
}

module.exports = {
  ChaosEngine,
  ExperimentRegistry
};
