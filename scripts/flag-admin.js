#!/usr/bin/env node
/**
 * Feature Flag Admin CLI
 * 
 * Manage feature flags from the command line.
 * 
 * Usage:
 *   node scripts/flag-admin.js --list
 *   node scripts/flag-admin.js --enable vc-outreach-v2
 *   node scripts/flag-admin.js --disable muni-warmup-skip
 *   node scripts/flag-admin.js --rollout muni-warmup-skip --percent 10
 *   node scripts/flag-admin.js --add-project vc-outreach-v2 --project alygn
 *   node scripts/flag-admin.js --remove-project vc-outreach-v2 --project bitcash
 *   node scripts/flag-admin.js --create new-flag --description "New feature"
 *   node scripts/flag-admin.js --delete old-flag
 *   node scripts/flag-admin.js --check vc-outreach-v2 --project alygn --user user123
 */

const { FeatureFlagManager } = require('../core/feature-flags');
const path = require('path');

// Config path
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'feature-flags.json');

// Parse command line args
function parseArgs(args) {
  const result = {
    command: null,
    flagName: null,
    project: null,
    user: null,
    percent: null,
    description: null
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--list':
      case '-l':
        result.command = 'list';
        break;
      case '--enable':
      case '-e':
        result.command = 'enable';
        result.flagName = args[++i];
        break;
      case '--disable':
      case '-d':
        result.command = 'disable';
        result.flagName = args[++i];
        break;
      case '--rollout':
      case '-r':
        result.command = 'rollout';
        result.flagName = args[++i];
        break;
      case '--percent':
      case '-p':
        result.percent = parseInt(args[++i], 10);
        break;
      case '--add-project':
        result.command = 'add-project';
        result.flagName = args[++i];
        break;
      case '--remove-project':
        result.command = 'remove-project';
        result.flagName = args[++i];
        break;
      case '--project':
        result.project = args[++i];
        break;
      case '--user':
      case '-u':
        result.user = args[++i];
        break;
      case '--create':
      case '-c':
        result.command = 'create';
        result.flagName = args[++i];
        break;
      case '--delete':
        result.command = 'delete';
        result.flagName = args[++i];
        break;
      case '--description':
      case '--desc':
        result.description = args[++i];
        break;
      case '--check':
        result.command = 'check';
        result.flagName = args[++i];
        break;
      case '--help':
      case '-h':
        result.command = 'help';
        break;
    }
  }
  
  return result;
}

// Print usage
function printUsage() {
  console.log(`
Feature Flag Admin CLI

Usage:
  node scripts/flag-admin.js <command> [options]

Commands:
  --list, -l                     List all flags
  --enable <flag>, -e <flag>     Enable a flag
  --disable <flag>, -d <flag>    Disable a flag
  --rollout <flag>, -r <flag>    Set rollout percentage (requires --percent)
  --add-project <flag>           Add project to allowlist (requires --project)
  --remove-project <flag>        Remove project from allowlist (requires --project)
  --create <flag>, -c <flag>     Create a new flag
  --delete <flag>                Delete a flag
  --check <flag>                 Check if flag is enabled (requires --project, optional --user)

Options:
  --project <name>               Project name
  --user <id>, -u <id>           User ID for percentage check
  --percent <n>, -p <n>          Rollout percentage (0-100)
  --description <text>           Flag description (for --create)
  --help, -h                     Show this help

Examples:
  node scripts/flag-admin.js --list
  node scripts/flag-admin.js --enable vc-outreach-v2
  node scripts/flag-admin.js --rollout muni-warmup-skip --percent 10
  node scripts/flag-admin.js --add-project vc-outreach-v2 --project alygn
  node scripts/flag-admin.js --check vc-outreach-v2 --project alygn --user user123
`);
}

// Main
function main() {
  const args = parseArgs(process.argv.slice(2));
  
  if (!args.command || args.command === 'help') {
    printUsage();
    process.exit(0);
  }
  
  const manager = new FeatureFlagManager({
    configPath: CONFIG_PATH,
    watchConfig: false
  });
  
  switch (args.command) {
    case 'list': {
      const flags = manager.getAllFlags();
      const metadata = manager.getMetadata();
      
      console.log('\nFeature Flags:');
      console.log('='.repeat(60));
      
      if (Object.keys(flags).length === 0) {
        console.log('  No flags configured');
      } else {
        for (const [name, flag] of Object.entries(flags)) {
          const status = flag.enabled ? '✓ ENABLED' : '✗ DISABLED';
          const projects = flag.allowedProjects?.length > 0
            ? ` [${flag.allowedProjects.join(', ')}]`
            : '';
          const rollout = flag.rolloutPercentage !== undefined
            ? ` (${flag.rolloutPercentage}%)`
            : '';
          
          console.log(`\n  ${name}:`);
          console.log(`    Status: ${status}${rollout}${projects}`);
          if (flag.description) {
            console.log(`    Description: ${flag.description}`);
          }
        }
      }
      
      console.log('\n' + '-'.repeat(60));
      console.log(`Version: ${metadata.version || 'unknown'}`);
      console.log(`Last Updated: ${metadata.lastUpdated || 'unknown'}`);
      console.log('');
      break;
    }
    
    case 'enable': {
      if (!args.flagName) {
        console.error('Error: Flag name required');
        process.exit(1);
      }
      
      if (!manager.getFlag(args.flagName)) {
        console.error(`Error: Flag '${args.flagName}' not found`);
        process.exit(1);
      }
      
      manager.enable(args.flagName);
      manager.save();
      console.log(`✓ Flag '${args.flagName}' enabled`);
      break;
    }
    
    case 'disable': {
      if (!args.flagName) {
        console.error('Error: Flag name required');
        process.exit(1);
      }
      
      if (!manager.getFlag(args.flagName)) {
        console.error(`Error: Flag '${args.flagName}' not found`);
        process.exit(1);
      }
      
      manager.disable(args.flagName);
      manager.save();
      console.log(`✓ Flag '${args.flagName}' disabled`);
      break;
    }
    
    case 'rollout': {
      if (!args.flagName) {
        console.error('Error: Flag name required');
        process.exit(1);
      }
      
      if (args.percent === null || isNaN(args.percent)) {
        console.error('Error: Percentage required (use --percent)');
        process.exit(1);
      }
      
      if (!manager.getFlag(args.flagName)) {
        console.error(`Error: Flag '${args.flagName}' not found`);
        process.exit(1);
      }
      
      manager.setRollout(args.flagName, args.percent);
      manager.save();
      console.log(`✓ Flag '${args.flagName}' rollout set to ${args.percent}%`);
      break;
    }
    
    case 'add-project': {
      if (!args.flagName) {
        console.error('Error: Flag name required');
        process.exit(1);
      }
      
      if (!args.project) {
        console.error('Error: Project required (use --project)');
        process.exit(1);
      }
      
      if (!manager.getFlag(args.flagName)) {
        console.error(`Error: Flag '${args.flagName}' not found`);
        process.exit(1);
      }
      
      manager.addProject(args.flagName, args.project);
      manager.save();
      console.log(`✓ Project '${args.project}' added to '${args.flagName}'`);
      break;
    }
    
    case 'remove-project': {
      if (!args.flagName) {
        console.error('Error: Flag name required');
        process.exit(1);
      }
      
      if (!args.project) {
        console.error('Error: Project required (use --project)');
        process.exit(1);
      }
      
      if (!manager.getFlag(args.flagName)) {
        console.error(`Error: Flag '${args.flagName}' not found`);
        process.exit(1);
      }
      
      manager.removeProject(args.flagName, args.project);
      manager.save();
      console.log(`✓ Project '${args.project}' removed from '${args.flagName}'`);
      break;
    }
    
    case 'create': {
      if (!args.flagName) {
        console.error('Error: Flag name required');
        process.exit(1);
      }
      
      if (manager.getFlag(args.flagName)) {
        console.error(`Error: Flag '${args.flagName}' already exists`);
        process.exit(1);
      }
      
      manager.createFlag(args.flagName, {
        enabled: false,
        rolloutPercentage: 0,
        allowedProjects: [],
        description: args.description || ''
      });
      manager.save();
      console.log(`✓ Flag '${args.flagName}' created (disabled by default)`);
      break;
    }
    
    case 'delete': {
      if (!args.flagName) {
        console.error('Error: Flag name required');
        process.exit(1);
      }
      
      if (!manager.getFlag(args.flagName)) {
        console.error(`Error: Flag '${args.flagName}' not found`);
        process.exit(1);
      }
      
      manager.deleteFlag(args.flagName);
      manager.save();
      console.log(`✓ Flag '${args.flagName}' deleted`);
      break;
    }
    
    case 'check': {
      if (!args.flagName) {
        console.error('Error: Flag name required');
        process.exit(1);
      }
      
      const flag = manager.getFlag(args.flagName);
      
      if (!flag) {
        console.log(`✗ Flag '${args.flagName}' not found`);
        process.exit(1);
      }
      
      const context = {
        project: args.project,
        userId: args.user
      };
      
      const enabled = manager.isEnabled(args.flagName, context);
      const status = enabled ? 'ENABLED' : 'DISABLED';
      
      console.log(`\nFlag: ${args.flagName}`);
      console.log(`Status: ${status}`);
      console.log(`Context:`);
      console.log(`  Project: ${context.project || 'none'}`);
      console.log(`  User: ${context.userId || 'none'}`);
      
      if (!enabled && flag.enabled) {
        // Explain why it's disabled
        if (flag.allowedProjects?.length > 0 && !flag.allowedProjects.includes(context.project)) {
          console.log(`\nReason: Project '${context.project}' not in allowlist [${flag.allowedProjects.join(', ')}]`);
        } else if (flag.rolloutPercentage < 100 && context.userId) {
          console.log(`\nReason: User not in ${flag.rolloutPercentage}% rollout`);
        }
      }
      console.log('');
      break;
    }
    
    default:
      console.error(`Unknown command: ${args.command}`);
      printUsage();
      process.exit(1);
  }
}

main();