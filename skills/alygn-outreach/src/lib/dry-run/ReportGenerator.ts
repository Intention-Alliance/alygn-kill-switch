/**
 * ReportGenerator — Generates dry-run reports and sends to Discord
 * 
 * In Mode B, after completing a dry-run pipeline, this module:
 * 1. Collects all simulated writes from data/dry-run/
 * 2. Generates a structured markdown report
 * 3. Sends an embed summary to Discord #annotations
 */
import fs from 'fs';
import path from 'path';
import { getDryRunBaseDir } from './DryRunSimulator';

/**
 * Summary of a single dry-run execution.
 */
export interface DryRunReportData {
  /** ISO timestamp of execution start */
  startedAt: string;
  /** ISO timestamp of completion */
  completedAt: string;
  /** Mode B only */
  mode: 'B';
  /** Entities discovered */
  entitiesDiscovered: number;
  /** Entities validated */
  entitiesValidated: number;
  /** Entities researched */
  entitiesResearched: number;
  /** Personalization/emails drafted */
  entitiesPersonalized: number;
  /** API calls made (Mode B only) */
  apiCallsMade: ApiCallRecord[];
  /** Simulated DB writes (Mode B only) */
  simulatedWrites: SimulatedWriteRecord[];
  /** Per-entity details */
  entities: EntityRecord[];
  /** Any errors encountered */
  errors: string[];
}

/**
 * A single API call made during Mode B execution.
 */
export interface ApiCallRecord {
  /** Description of what was called */
  description: string;
  /** e.g. 'Perplexity Sonar', 'Regex MX', 'Notion' */
  provider: string;
  /** e.g. 'POST /chat/completions', 'MX lookup' */
  endpoint: string;
  /** Human-readable result summary */
  result: string;
  /** Milliseconds */
  duration?: number;
}

/**
 * A simulated database write performed in Mode B.
 */
export interface SimulatedWriteRecord {
  /** 'notion' | 'supabase' */
  system: 'notion' | 'supabase';
  /** Table or object type */
  table: string;
  /** Filename written */
  filename: string;
  /** Number of rows/objects written */
  rowCount: number;
  /** Full path to the file */
  filepath: string;
}

/**
 * Per-entity processing summary.
 */
export interface EntityRecord {
  name: string;
  type: 'vc' | 'municipal';
  /** 'discovered' | 'validated' | 'researched' | 'personalized' | 'sent' */
  status: string;
  email?: string;
  notes?: string;
}

/**
 * Collect all simulated write files from the dry-run directory.
 */
export function collectSimulatedWrites(baseDir: string): SimulatedWriteRecord[] {
  const writes: SimulatedWriteRecord[] = [];

  // Notion writes
  const notionDir = path.join(baseDir, 'notion');
  if (fs.existsSync(notionDir)) {
    for (const file of fs.readdirSync(notionDir)) {
      if (!file.endsWith('.json')) continue;
      const filepath = path.join(notionDir, file);
      try {
        const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        const rowCount = content.results?.length ?? 1;
        writes.push({
          system: 'notion',
          table: content.object === 'list' ? 'query' : 'page',
          filename: file,
          rowCount,
          filepath,
        });
      } catch {
        // Skip malformed files
      }
    }
  }

  // Supabase writes
  const supabaseDir = path.join(baseDir, 'supabase');
  if (fs.existsSync(supabaseDir)) {
    for (const file of fs.readdirSync(supabaseDir)) {
      if (!file.endsWith('.json')) continue;
      const filepath = path.join(supabaseDir, file);
      try {
        const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        writes.push({
          system: 'supabase',
          table: content.table,
          filename: file,
          rowCount: content.rows?.length ?? 1,
          filepath,
        });
      } catch {
        // Skip malformed files
      }
    }
  }

  return writes;
}

/**
 * Generate a markdown report file from the execution data.
 * Returns the path to the generated report.
 */
export function generateMarkdownReport(
  data: DryRunReportData,
  baseDir: string
): string {
  const timestamp = Date.now();
  const filename = `dry-run-report-${timestamp}.md`;
  const reportsDir = path.join(baseDir, 'reports');
  
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  
  const filepath = path.join(reportsDir, filename);
  
  const notionWrites = data.simulatedWrites.filter(w => w.system === 'notion');
  const supabaseWrites = data.simulatedWrites.filter(w => w.system === 'supabase');
  const totalApiCalls = data.apiCallsMade.length;
  const totalWrites = data.simulatedWrites.length;

  const lines: string[] = [
    `# Dry-Run Report — ${data.startedAt}`,
    '',
    '## Mode: B (`--dry-run` + `USE_DIRECT_API=true`)',
    '',
    '> **⚠️  Pre-Production Test** — No real database writes occurred.',
    '> All Notion and Supabase operations were simulated and saved to JSON files below.',
    '',
    '## Execution Summary',
    '',
    '| Metric | Count |',
    '|--------|-------|',
    `| Entities Discovered | ${data.entitiesDiscovered} |`,
    `| Entities Validated | ${data.entitiesValidated} |`,
    `| Entities Researched | ${data.entitiesResearched} |`,
    `| Personalization Emails Drafted | ${data.entitiesPersonalized} |`,
    `| API Calls Made | ${totalApiCalls} |`,
    `| Simulated DB Writes | ${totalWrites} |`,
    '',
    '## API Calls Made',
    '',
    totalApiCalls > 0
      ? [
          '| # | Provider | Endpoint | Result |',
          '|---|----------|----------|--------|',
          ...data.apiCallsMade.map((call, i) =>
            `| ${i + 1} | ${call.provider} | ${call.endpoint} | ${call.result} |`
          ),
        ].join('\n')
      : '_No API calls recorded._',
    '',
    '## Simulated DB Writes',
    '',
    '### Notion',
    '',
    notionWrites.length > 0
      ? [
          '| File | Entity | Rows |',
          '|------|--------|------|',
          ...notionWrites.map(w =>
            `| ${w.filename} | ${w.table} | ${w.rowCount} |`
          ),
        ].join('\n')
      : '_No Notion operations simulated._',
    '',
    '### Supabase',
    '',
    supabaseWrites.length > 0
      ? [
          '| File | Table | Rows |',
          '|------|-------|------|',
          ...supabaseWrites.map(w =>
            `| ${w.filename} | ${w.table} | ${w.rowCount} |`
          ),
        ].join('\n')
      : '_No Supabase operations simulated._',
    '',
    '## Entities Processed',
    '',
  ];

  // Group by type
  const vcs = data.entities.filter(e => e.type === 'vc');
  const municipals = data.entities.filter(e => e.type === 'municipal');

  if (vcs.length > 0) {
    lines.push('### VCs', '');
    for (const entity of vcs) {
      lines.push(`**${entity.name}**${entity.email ? ` — ${entity.email}` : ''}`);
      lines.push(`- Status: ${entity.status}`);
      if (entity.notes) lines.push(`- ${entity.notes}`);
      lines.push('');
    }
  }

  if (municipals.length > 0) {
    lines.push('### Municipalities', '');
    for (const entity of municipals) {
      lines.push(`**${entity.name}**${entity.email ? ` — ${entity.email}` : ''}`);
      lines.push(`- Status: ${entity.status}`);
      if (entity.notes) lines.push(`- ${entity.notes}`);
      lines.push('');
    }
  }

  if (data.errors.length > 0) {
    lines.push('## Errors', '');
    for (const err of data.errors) {
      lines.push(`- ${err}`);
    }
    lines.push('');
  }

  lines.push('## Next Steps (Production)', '');
  lines.push('1. Review simulated DB writes in `data/dry-run/notion/` and `data/dry-run/supabase/`');
  lines.push('2. Verify data looks correct — structures match real DB schemas');
  lines.push('3. Run without `--dry-run` to execute for real:', '');
  lines.push('   ```bash');
  lines.push('   bun bin/alygn-outreach.ts --type=vc --action=pipeline --limit=10');
  lines.push('   ```');
  lines.push('');

  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
  console.log(`[DRY RUN REPORT] Generated: ${filepath}`);

  return filepath;
}

/**
 * Build a Discord embed payload from the report data.
 */
export function buildDiscordEmbed(data: DryRunReportData, reportFilepath: string): object {
  const notionWrites = data.simulatedWrites.filter(w => w.system === 'notion').length;
  const supabaseWrites = data.simulatedWrites.filter(w => w.system === 'supabase').length;
  const totalApiCalls = data.apiCallsMade.length;

  return {
    embeds: [
      {
        title: '🎯 Dry-Run Report — Mode B',
        description:
          'Real API calls made · DB writes simulated to JSON files',
        color: 0x3498db, // Blue
        fields: [
          {
            name: 'Entities',
            value: [
              `Discovered: ${data.entitiesDiscovered}`,
              `Researched: ${data.entitiesResearched}`,
              `Personalized: ${data.entitiesPersonalized}`,
            ].join('\n'),
            inline: true,
          },
          {
            name: 'API Calls',
            value: `${totalApiCalls} made`,
            inline: true,
          },
          {
            name: 'Simulated DB Writes',
            value: [
              `${totalApiCalls > 0 ? notionWrites : 0} Notion`,
              `${totalApiCalls > 0 ? supabaseWrites : 0} Supabase`,
            ].join('\n'),
            inline: true,
          },
          {
            name: 'Report File',
            value: reportFilepath,
            inline: false,
          },
        ],
        footer: {
          text: 'Set --dry-run only (no USE_DIRECT_API) for faster Mode A testing',
        },
        timestamp: data.completedAt,
      },
    ],
  };
}


