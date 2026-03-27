/**
 * ALYGN Grant Discovery Skill
 * Main entry point for grant discovery, research, validation, and sync
 * 
 * Usage:
 *   bun run src/index.ts discover --limit=50 --dry-run
 *   bun run src/index.ts research --limit=20
 *   bun run src/index.ts validate --limit=20
 *   bun run src/index.ts sync --limit=20
 *   bun run src/index.ts pipeline --limit=50 --dry-run
 * 
 * Environment Variables:
 *   USE_DIRECT_API=true    - Use APIs directly instead of request files
 *   NOTION_API_KEY         - Notion integration API key
 *   NOTION_DATABASE_ID     - Notion database ID
 *   EMAIL_SMTP_HOST        - SMTP server for notifications
 *   EMAIL_SMTP_USER        - SMTP username
 *   EMAIL_SMTP_PASS        - SMTP password
 *   EMAIL_FROM             - From address for emails
 *   EMAIL_TO               - Recipient for summaries (Tania)
 */

import { GrantDiscoveryPipeline } from './core/Pipeline';
import { GrantEntity } from './entities/GrantEntity';
import { GrantDiscoveryStrategy } from './strategies/discovery/GrantDiscoveryStrategy';
import { GrantResearchStrategy } from './strategies/research/GrantResearchStrategy';
import { ALYGNAlignmentValidator } from './strategies/alignment/ALYGNAlignmentValidator';
import { NotionGrantSync } from './notion/NotionSync';
import { GrantDiscoveryEmailService } from './email/EmailService';
import type { PipelineConfig, ResearchSourceType } from './types/index';

// Re-export types and classes
export { 
  GrantDiscoveryPipeline, 
  GrantDiscoveryStrategy,
  GrantResearchStrategy,
  ALYGNAlignmentValidator,
  NotionGrantSync,
  GrantDiscoveryEmailService
};

// Re-export entities
export { GrantEntity } from './entities/GrantEntity';

export type { PipelineConfig } from './types/index';

/**
 * Parse command line arguments
 * 
 * @returns {object} Parsed arguments
 */
function parseArgs(): {
  phase: 'discover' | 'research' | 'validate' | 'sync' | 'pipeline';
  dryRun: boolean;
  limit: number;
  focusAreas: string[];
  sources: ResearchSourceType[];
} {
  const args = process.argv.slice(2);
  
  // First argument is the phase
  const phase = (args[0] as 'discover' | 'research' | 'validate' | 'sync' | 'pipeline') || 'pipeline';
  
  const parsed = {
    phase,
    dryRun: false,
    limit: 50,
    focusAreas: ['AI safety', 'AI governance', 'AI alignment'],
    sources: ['grok', 'perplexity'] as ResearchSourceType[]
  };

  for (const arg of args.slice(1)) {
    if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg.startsWith('--limit=')) {
      parsed.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--focus=')) {
      parsed.focusAreas = arg.split('=')[1].split(',');
    } else if (arg.startsWith('--sources=')) {
      parsed.sources = arg.split('=')[1].split(',') as ResearchSourceType[];
    }
  }

  return parsed;
}

/**
 * Load configuration from environment and defaults
 * 
 * @returns {PipelineConfig} Pipeline configuration
 */
function loadConfig(): PipelineConfig {
  return {
    notion: {
      apiKey: process.env.NOTION_API_KEY || '',
      databaseId: process.env.NOTION_DATABASE_ID || ''
    },
    email: {
      smtp: {
        host: process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
        secure: process.env.EMAIL_SMTP_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_SMTP_USER || '',
          pass: process.env.EMAIL_SMTP_PASS || ''
        }
      },
      from: process.env.EMAIL_FROM || 'grants@alygn.org',
      to: process.env.EMAIL_TO || 'tania@alygn.org'
    },
    discovery: {
      sources: ['grok', 'perplexity'],
      focusAreas: ['AI safety', 'AI governance', 'AI alignment'],
      excludeClosed: true
    },
    grok: {
      apiKey: process.env.GROK_API_KEY
    },
    perplexity: {
      apiKey: process.env.PERPLEXITY_API_KEY
    }
  };
}

/**
 * Validate arguments
 * 
 * @param {object} args - Parsed arguments
 */
function validateArgs(args: { phase: string }): void {
  const validPhases = ['discover', 'research', 'validate', 'sync', 'pipeline'];
  
  if (!validPhases.includes(args.phase)) {
    console.error(`Error: Invalid phase "${args.phase}". Must be one of: ${validPhases.join(', ')}`);
    process.exit(1);
  }
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
ALYGN Grant Discovery Skill

Usage:
  alygn-grant-discovery <phase> [options]

Phases:
  discover    Find new grants from multiple sources
  research    Deep research on discovered grants
  validate    Validate alignment with ALYGN
  sync        Sync to Notion and send notifications
  pipeline    Run full pipeline (discover → research → validate → sync)

Options:
  --dry-run          Generate mock data instead of real API calls
  --limit=N          Maximum grants to process (default: 50)
  --focus=AREAS      Comma-separated focus areas (default: "AI safety,AI governance,AI alignment")
  --sources=SOURCES  Comma-separated sources: grok,perplexity,web_fetch

Environment:
  USE_DIRECT_API=true  - Use APIs directly instead of request file pattern
  NOTION_API_KEY       - Notion API integration key
  EMAIL_SMTP_HOST      - SMTP server for email notifications

Examples:
  alygn-grant-discovery discover --limit=20 --dry-run
  alygn-grant-discovery pipeline --limit=50
  alygn-grant-discovery sync --dry-run
`);
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const args = parseArgs();
  
  // Show help
  if (args.phase === 'help' || process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }
  
  validateArgs(args);
  
  console.log(`
╔════════════════════════════════════════════╗
║     ALYGN Grant Discovery Skill v1.0.0   ║
╚════════════════════════════════════════════╝
`);

  try {
    const config = loadConfig();
    const pipeline = new GrantDiscoveryPipeline(config);

    // Run the appropriate phase
    if (args.phase === 'pipeline') {
      const results = await pipeline.runFullPipeline({
        dryRun: args.dryRun,
        limit: args.limit,
        focusAreas: args.focusAreas
      });
      
      console.log('\n' + '='.repeat(60));
      console.log('PIPELINE COMPLETE');
      console.log('='.repeat(60));
      console.log('\nPhase Summary:');
      results.forEach((result, i) => {
        const phase = ['discover', 'research', 'validate', 'sync'][i];
        const status = result.success ? '✅' : '❌';
        console.log(`  ${status} ${phase}: ${result.grantsProcessed} grants`);
      });
      
    } else {
      const result = await pipeline.run(args.phase, {
        dryRun: args.dryRun,
        limit: args.limit,
        focusAreas: args.focusAreas
      });
      
      console.log('\n' + '='.repeat(60));
      console.log('RESULT:');
      console.log('='.repeat(60) + '\n');
      console.log(JSON.stringify(result, null, 2));
    }
    
    console.log('\n' + '='.repeat(60));
    process.exit(0);
    
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Error:', message);
    console.error(error instanceof Error ? error.stack : '');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('index.ts')) {
  main();
}

export { parseArgs, loadConfig, validateArgs, main };
