/**
 * Alygn Outreach Skill - Main Entry Point (TypeScript)
 */
import { Pipeline } from './core/Pipeline';
import { PreflightChecker, CheckPhase } from './core/PreflightChecker';

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
  retryFailed: boolean;
  // Preflight check options
  preflightChecks: string | null;
  requireApproved: boolean;
  skipPreflight: boolean;
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
    retryFailed: false,
    // Preflight options
    preflightChecks: null,
    requireApproved: false,
    skipPreflight: false,
    config: {}
  };
  
  for (const arg of args) {
    if (arg === '--dry-run' || arg === '-n') {
      parsed.dryRun = true;
    } else if (arg === '--retry-failed') {
      parsed.retryFailed = true;
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
    } else if (arg.startsWith('--preflight-checks=')) {
      parsed.preflightChecks = arg.split('=')[1];
    } else if (arg === '--require-approved') {
      parsed.requireApproved = true;
    } else if (arg === '--skip-preflight') {
      parsed.skipPreflight = true;
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
  --retry-failed             Retry failed sends from latest wave state
  --preflight-checks=<list>  Run specific checks: state-file-exists,has-approved-drafts,...
  --require-approved         Require at least 1 approved draft (for send phase)
  --skip-preflight           Bypass preflight checks (emergency use)
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

  # Retry Failed Sends (Afternoon Cron)
  bun bin/alygn-outreach.ts --type=vc --action=send --retry-failed --limit=50
  bun bin/alygn-outreach.ts --type=municipal --action=send --retry-failed --limit=50

  # Preflight Checks (before cron job)
  bun bin/alygn-outreach.ts --type=vc --action=send --preflight-checks=state-file-exists,has-approved-drafts,credentials-valid,not-running
  bun bin/alygn-outreach.ts --type=municipal --action=research --preflight-checks=notion-api-ok,supabase-ok
  bun bin/alygn-outreach.ts --action=recon --preflight-checks=sync-status,no-orphans
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

  // Run preflight checks if enabled
  if (!args.skipPreflight && args.action !== 'help') {
    // Determine phase based on action
    let preflightPhase: CheckPhase = 'send';
    if (args.action === 'research' || args.action === 'discover') {
      preflightPhase = 'research';
    } else if (args.action === 'recon') {
      preflightPhase = 'recon';
    }

    // Only run checks if --preflight-checks specified or --require-approved
    if (args.preflightChecks !== null || args.requireApproved) {
      const checker = new PreflightChecker({
        phase: preflightPhase,
        type: args.type,
      });

      // Parse specific checks if provided
      const specificChecks = args.preflightChecks
        ? args.preflightChecks.split(',')
        : undefined;

      // Force has-approved-drafts if --require-approved
      if (args.requireApproved) {
        const requiredChecks = specificChecks || PreflightChecker.listChecks(preflightPhase).map(c => c.name);
        if (!requiredChecks.includes('has-approved-drafts')) {
          requiredChecks.push('has-approved-drafts');
        }
        checker.run(requiredChecks);
      } else {
        checker.run(specificChecks);
      }

      checker.printStatus();

      if (!checker.isReady()) {
        const failed = checker.getFailedChecks();
        console.error('❌ Preflight checks failed:');
        for (const check of failed) {
          console.error(`   • ${check.name}: ${check.message}`);
        }
        process.exit(1);
      }
    }
  }

  // Run action
  try {
    const result = await pipeline.run(args.action, {
      dryRun: args.dryRun,
      limit: args.limit,
      region: args.region,
      input: args.input,
      draftStatus: args.draftStatus,
      sendToList: args.sendToList,
      retryFailed: args.retryFailed
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

export { main, parseArgs };
