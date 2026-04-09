/**
 * Chaos Engineering Framework - Safety Tests
 * 
 * Critical safety tests to ensure chaos experiments:
 * - Kill switch works correctly
 * - Experiments respect scope (staging only)
 * - Cleanup happens after experiments
 * 
 * Run: npm test -- chaos-engineering.test.js
 */

const { ChaosEngine, ExperimentRegistry } = require('../core/chaos-engineering');
const fs = require('fs');
const path = require('path');

describe('ChaosEngine Safety Tests', () => {
  let engine;
  
  beforeEach(() => {
    // Reset state before each test
    engine = null;
  });

  describe('Kill Switch', () => {
    test('kill switch activates immediately', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      const result = await engine.killSwitch();
      
      expect(result.killSwitchActivated).toBe(true);
      expect(engine.isKillSwitchActive()).toBe(true);
    });

    test('kill switch prevents experiment execution', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      // Activate kill switch
      await engine.killSwitch();
      
      // Try to load and execute experiment
      const mockExperiment = {
        type: 'pod-kill',
        scope: 'staging',
        targets: ['pod:test-123']
      };
      
      engine.currentExperiment = mockExperiment;
      
      await expect(engine.execute())
        .rejects
        .toThrow('Kill switch is active');
    });

    test('kill switch cleans up active processes', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      // Simulate active processes
      engine.activeProcesses = [
        { type: 'tc', interface: 'eth0', cleanup: 'echo cleanup' }
      ];
      
      const result = await engine.killSwitch();
      
      expect(result.cleanupResults).toHaveLength(1);
      expect(result.cleanupResults[0].success).toBe(true);
      expect(engine.activeProcesses).toHaveLength(0);
    });

    test('kill switch reset requires explicit confirmation', () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      // Activate kill switch
      engine.killSwitchActive = true;
      
      // Try to reset without confirmation
      expect(() => engine.resetKillSwitch(false))
        .toThrow('Must explicitly confirm kill switch reset');
      
      // Reset with confirmation
      expect(() => engine.resetKillSwitch(true)).not.toThrow();
      expect(engine.isKillSwitchActive()).toBe(false);
    });
  });

  describe('Scope Validation', () => {
    test('rejects production scope by default', () => {
      expect(() => new ChaosEngine({ scope: 'production' }))
        .toThrow('Invalid scope');
    });

    test('allows staging scope', () => {
      expect(() => new ChaosEngine({ scope: 'staging' })).not.toThrow();
    });

    test('allows development scope', () => {
      expect(() => new ChaosEngine({ scope: 'development' })).not.toThrow();
    });

    test('allows local scope', () => {
      expect(() => new ChaosEngine({ scope: 'local' })).not.toThrow();
    });

    test('experiment scope must match engine scope', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      const mismatchedExperiment = {
        type: 'pod-kill',
        scope: 'development', // Mismatch!
        targets: ['pod:test-123']
      };
      
      engine.currentExperiment = mismatchedExperiment;
      
      await expect(engine.execute())
        .rejects
        .toThrow();
    });
  });

  describe('Experiment Validation', () => {
    test('rejects experiments without required fields', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      const invalidExperiment = {
        // Missing type and scope
        targets: ['pod:test-123']
      };
      
      expect(() => engine._validateExperiment(invalidExperiment))
        .toThrow('Missing required field');
    });

    test('rejects invalid experiment types', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      const invalidExperiment = {
        type: 'invalid-type',
        scope: 'staging'
      };
      
      expect(() => engine._validateExperiment(invalidExperiment))
        .toThrow('Invalid experiment type');
    });

    test('accepts valid experiment configurations', () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      const validExperiments = [
        { type: 'pod-kill', scope: 'staging', targets: ['pod:test'] },
        { type: 'network-latency', scope: 'staging', latencyMs: 100 },
        { type: 'dependency-failure', scope: 'staging', dependency: { target: 'db' } }
      ];
      
      for (const exp of validExperiments) {
        expect(() => engine._validateExperiment(exp)).not.toThrow();
      }
    });
  });

  describe('Cleanup After Experiments', () => {
    test('clears active processes after kill switch', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      engine.activeProcesses = [
        { type: 'tc', interface: 'eth0', cleanup: 'echo cleanup1' },
        { type: 'tc', interface: 'eth1', cleanup: 'echo cleanup2' }
      ];
      
      await engine.killSwitch();
      
      expect(engine.activeProcesses).toHaveLength(0);
    });

    test('resets current experiment after kill switch', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      engine.currentExperiment = { type: 'pod-kill', scope: 'staging' };
      
      await engine.killSwitch();
      
      expect(engine.currentExperiment).toBeNull();
    });

    test('dry run mode does not execute real commands', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      engine.currentExperiment = {
        type: 'pod-kill',
        scope: 'staging',
        targets: ['pod:test-123']
      };
      
      const result = await engine.execute();
      
      expect(result.success).toBe(true);
      expect(result.results[0].dryRun).toBe(true);
      expect(result.results[0].status).toBe('simulated');
    });
  });

  describe('Error Handling', () => {
    test('handles execution without loaded experiment', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      await expect(engine.execute())
        .rejects
        .toThrow('No experiment loaded');
    });

    test('handles concurrent execution attempts', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      engine.currentExperiment = {
        type: 'pod-kill',
        scope: 'staging',
        targets: ['pod:test-123']
      };
      
      engine.isRunning = true;
      
      await expect(engine.execute())
        .rejects
        .toThrow('Experiment already running');
    });

    test('handles pod-kill without targets', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      engine.currentExperiment = {
        type: 'pod-kill',
        scope: 'staging',
        targets: [] // Empty targets
      };
      
      await expect(engine.execute())
        .rejects
        .toThrow('No targets specified');
    });

    test('handles dependency-failure without target', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      engine.currentExperiment = {
        type: 'dependency-failure',
        scope: 'staging',
        dependency: {
          type: 'timeout'
          // Missing target
        }
      };
      
      await expect(engine.execute())
        .rejects
        .toThrow('Dependency target required');
    });
  });

  describe('Status Tracking', () => {
    test('reports correct initial status', () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      const status = engine.getStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.killSwitchActive).toBe(false);
      expect(status.scope).toBe('staging');
      expect(status.currentExperiment).toBeNull();
      expect(status.activeProcesses).toBe(0);
    });

    test('tracks experiment execution', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      engine.currentExperiment = {
        type: 'pod-kill',
        scope: 'staging',
        targets: ['pod:test-123']
      };
      
      engine.isRunning = true;
      engine.startTime = Date.now();
      
      const status = engine.getStatus();
      
      expect(status.isRunning).toBe(true);
      expect(status.startTime).toBeDefined();
    });

    test('tracks results after execution', async () => {
      engine = new ChaosEngine({ scope: 'staging', dryRun: true });
      
      engine.currentExperiment = {
        type: 'pod-kill',
        scope: 'staging',
        targets: ['pod:test-123']
      };
      
      await engine.execute();
      
      const results = engine.getResults();
      
      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('pod-kill');
    });
  });
});

describe('ExperimentRegistry', () => {
  let registry;
  const testConfigPath = path.join(__dirname, '..', 'config', 'chaos-experiments');

  beforeEach(() => {
    registry = new ExperimentRegistry(testConfigPath);
  });

  test('loads experiments from config directory', () => {
    const experiments = registry.list();
    
    expect(experiments.length).toBeGreaterThan(0);
  });

  test('retrieves experiment by name', () => {
    const experiment = registry.get('pod-kill');
    
    expect(experiment).not.toBeNull();
    expect(experiment.type).toBe('pod-kill');
  });

  test('returns null for non-existent experiment', () => {
    const experiment = registry.get('non-existent');
    
    expect(experiment).toBeNull();
  });

  test('lists all experiments with metadata', () => {
    const experiments = registry.list();
    
    for (const exp of experiments) {
      expect(exp).toHaveProperty('name');
      expect(exp).toHaveProperty('type');
      expect(exp).toHaveProperty('scope');
    }
  });
});

// Integration test helpers
describe('Integration Safety Checks', () => {
  test('full experiment lifecycle with cleanup', async () => {
    const engine = new ChaosEngine({ scope: 'staging', dryRun: true });
    
    // Load experiment (simulated)
    engine.currentExperiment = {
      type: 'network-latency',
      scope: 'staging',
      latencyMs: 100,
      interface: 'eth0'
    };
    
    // Execute
    const result = await engine.execute();
    expect(result.success).toBe(true);
    
    // Cleanup
    const cleanup = await engine.killSwitch();
    expect(cleanup.killSwitchActivated).toBe(true);
    
    // Verify clean state
    expect(engine.getStatus().isRunning).toBe(false);
    expect(engine.getStatus().killSwitchActive).toBe(true);
  });

  test('multiple experiments can be loaded sequentially', async () => {
    const engine = new ChaosEngine({ scope: 'staging', dryRun: true });
    
    const experiments = [
      { type: 'pod-kill', scope: 'staging', targets: ['pod:test'] },
      { type: 'network-latency', scope: 'staging', latencyMs: 50 },
      { type: 'dependency-failure', scope: 'staging', dependency: { target: 'db', type: 'timeout' } }
    ];
    
    for (const exp of experiments) {
      engine.currentExperiment = exp;
      const result = await engine.execute();
      expect(result.success).toBe(true);
    }
  });
});
