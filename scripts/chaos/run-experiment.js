#!/usr/bin/env node

/**
 * Chaos Experiment CLI
 * 
 * Execute chaos engineering experiments with safety checks.
 * 
 * Usage:
 *   node scripts/chaos/run-experiment.js <experiment-name> [options]
 *   
 * Examples:
 *   node scripts/chaos/run-experiment.js pod-kill
 *   node scripts/chaos/run-experiment.js network-latency --dry-run
 *   node scripts/chaos/run-experiment.js db-timeout --scope staging
 *   node scripts/chaos/run-experiment.js --kill  # Activate kill switch
 * 
 * Options:
 *   --scope <staging|production>  Environment scope (default: staging)
 *   --dry-run                     Simulate without executing
 *   --kill                        Activate kill switch immediately
 *   --status                      Show current experiment status
 *   --list                        List available experiments
 *   --config <path>               Custom config directory path
 *   --verbose                     Enable verbose logging
 */

const path = require('path');
const { ChaosEngine, ExperimentRegistry } = require('../../core/chaos-engineering');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  scope: 'staging',
  dryRun: false,
  kill: false,
  status: false,
  list: false,
  config: null,
  verbose: false,
  experiment: null
};

// Parse flags
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '--kill') {
    options.kill = true;
  } else if (arg === '--dry-run') {
    options.dryRun = true;
  } else if (arg === '--status') {
    options.status = true;
  } else if (arg === '--list') {
    options.list = true;
  } else if (arg === '--verbose') {
    options.verbose = true;
  } else if (arg === '--scope' && args[i + 1]) {
    options.scope = args[++i];
  } else if (arg === '--config' && args[i + 1]) {
    options.config = args[++i];
  } else if (!arg.startsWith('--')) {
    options.experiment = arg;
  }
}

// Main execution
async function main() {
  console.log('⚙️  Chaos Engineering CLI\n');
  
  // Handle kill switch
  if (options.kill) {
    console.log('🚨 ACTIVATING KILL SWITCH 🚨\n');
    
    const engine = new ChaosEngine({
      scope: options.scope,
      dryRun: false,
      configPath: options.config
    });
    
    const result = await engine.killSwitch();
    console.log('\nKill Switch Results:');
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  
  // Handle status check
  if (options.status) {
    const engine = new ChaosEngine({
      scope: options.scope,
      dryRun: options.dryRun,
      configPath: options.config
    });
    
    const status = engine.getStatus();
    console.log('Current Status:');
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  
  // Handle experiment listing
  if (options.list) {
    const registry = new ExperimentRegistry(options.config);
    const experiments = registry.list();
    
    console.log('Available Experiments:\n');
    
    if (experiments.length === 0) {
      console.log('  No experiments found.\n');
      return;
    }
    
    for (const exp of experiments) {
      console.log(`  ${exp.name}`);
      console.log(`    Type: ${exp.type}`);
      console.log(`    Scope: ${exp.scope}`);
      if (exp.description) {
        console.log(`    Description: ${exp.description}`);
      }
      console.log('');
    }
    
    return;
  }
  
  // Validate experiment name
  if (!options.experiment) {
    console.error('Error: No experiment specified\n');
    console.log('Usage: node scripts/chaos/run-experiment.js <experiment-name> [options]\n');
    console.log('Run with --list to see available experiments\n');
    process.exit(1);
  }
  
  // Initialize engine
  const engine = new ChaosEngine({
    scope: options.scope,
    dryRun: options.dryRun,
    configPath: options.config
  });
  
  // Safety warning
  if (options.scope === 'production') {
    console.warn('⚠️  WARNING: Running in PRODUCTION scope\n');
    console.warn('This requires explicit approval. Continue? (y/n)');
    
    // In CLI mode, we'll just warn and require --dry-run for production
    if (!options.dryRun) {
      console.error('\nError: Production experiments require --dry-run flag for safety\n');
      process.exit(1);
    }
  }
  
  try {
    // Load experiment
    console.log(`Loading experiment: ${options.experiment}`);
    await engine.loadExperiment(`${options.experiment}.json`);
    
    // Execute
    console.log('\nExecuting experiment...\n');
    const result = await engine.execute();
    
    // Output results
    console.log('\n--- Experiment Results ---\n');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n✅ Experiment completed successfully\n');
    } else {
      console.log('\n❌ Experiment failed\n');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (options.verbose) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
