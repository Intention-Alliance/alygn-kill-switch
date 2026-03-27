/**
 * Alygn Outreach Skill - Main Entry Point (TypeScript)
 */
import { Pipeline } from './core/Pipeline.js';

// CLI argument types
interface CLIArgs {
  type: 'vc' | 'municipal';
  action: string;
  dryRun: boolean;
  limit: number;
  region: string | null;
  input: string | null;
  draftStatus: string;
  sendToList: string[];
  testEmail: string | null;
  validator: string;
  config: Record<string, unknown>;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): CLIArgs {
  const parsed: CLIArgs = {
    type: 'vc',
    action: 'pipeline',
    dryRun: false,
    limit: 20,
    region: null,
    input: null,
    draftStatus: 'Approved',
    sendToList: [],
    testEmail: null,
    validator: 'regex-mx',
    config: {}
  };
  
  for (const arg of args) {
    if (arg === '--dry-run' || arg === '-n') {
      parsed.dryRun = true;
    } else if (arg.startsWith('--type=')) {
      const type = arg.split('=')[1].toLowerCase();
      if (type === 'vc' || type === 'municipal') {
        parsed.type = type;
      }
    } else if (arg.startsWith('--action=')) {
      parsed.action = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--limit=')) {
      parsed.limit = parseInt(arg.split('=')[1], 10) || 20;
    } else if (arg.startsWith('--region=')) {
      parsed.region = arg.split('=')[1];
    } else if (arg.startsWith('--input=')) {
      parsed.input = arg.split('=')[1];
    } else if (arg.startsWith('--draft-status=')) {
      parsed.draftStatus = arg.split('=')[1];
    } else if (arg.startsWith('--email-send-to=')) {
      parsed.sendToList = arg.split('=')[1].split(',');
    } else if (arg.startsWith('--test-email=')) {
      parsed.testEmail = arg.split('=')[1];
    } else if (arg.startsWith('--validator=')) {
      parsed.validator = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  
  return parsed;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
ALYGN Outreach CLI (TypeScript)

Usage: bun bin/alygn-outreach.ts [options]

Options:
  --type=<vc|municipal>     Entity type (default: vc)
  --action=<action>         Action: discover, validate, research, personalize, send, pipeline
  --limit=<n>               Max entities to process (default: 20)
  --region=<region>          Region filter (e.g., costa-rica)
  --input=<file>            Input state file
  --draft-status=<status>    Draft status filter (default: Approved)
  --email-send-to=<ids>      Comma-separated entity IDs
  --test-email=<email>       Override recipient email
  --validator=<type>         Validator: regex-mx, zerobounce (default: regex-mx)
  --dry-run, -n              Simulate without executing
  --help, -h                 Show this help

Examples:
  # VC Discovery
  bun bin/alygn-outreach.ts --type=vc --action=discover --limit=10 --dry-run

  # Municipal Discovery (Costa Rica)
  bun bin/alygn-outreach.ts --type=municipal --region=costa-rica --action=discover --limit=10 --dry-run

  # Full Pipeline
  bun bin/alygn-outreach.ts --type=vc --action=pipeline --limit=5 --dry-run

  # Send with Two-Filter System
  bun bin/alygn-outreach.ts --type=vc --action=send --draft-status=Approved --email-send-to=entity-abc123
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  
  console.log('🎯 Alygn Outreach CLI (TypeScript)\n');
  
  // Build config
  const config: Record<string, unknown> = {
    validation: {
      validatorType: args.validator
    },
    sending: {
      testEmail: args.testEmail,
      fromEmail: 'andrew@alygn.com'
    }
  };
  
  // Create pipeline
  const pipeline = new Pipeline(args.type, config);
  
  // Run action
  try {
    const result = await pipeline.run(args.action, {
      dryRun: args.dryRun,
      limit: args.limit,
      region: args.region,
      input: args.input,
      draftStatus: args.draftStatus,
      sendToList: args.sendToList
    });
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Results');
    console.log('='.repeat(60));
    
    if (result.discovered !== undefined) {
      console.log(`   Discovered: ${result.discovered}`);
    }
    if (result.validated !== undefined) {
      console.log(`   Validated: ${result.validated}`);
    }
    if (result.researched !== undefined) {
      console.log(`   Researched: ${result.researched}`);
    }
    if (result.personalized !== undefined) {
      console.log(`   Personalized: ${result.personalized}`);
    }
    if (result.sent !== undefined) {
      console.log(`   Sent: ${result.sent}`);
      console.log(`   Failed: ${result.failed || 0}`);
    }
    if (result.stateFile) {
      console.log(`   State: ${result.stateFile}`);
    }
    
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error(`\n❌ Error: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', (error as Error).message);
  process.exit(1);
});

export { parseArgs, main };
