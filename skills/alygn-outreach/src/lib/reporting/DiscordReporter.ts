/**
 * Discord Reporter - Generates and sends dry-run reports to Discord
 */
import fs from 'fs';
import path from 'path';
import { NotionSimulator } from '../simulation/NotionSimulator';
import { SupabaseSimulator } from '../simulation/SupabaseSimulator';

export interface DryRunReportOptions {
  webhookUrl?: string;
  outputDir?: string;
  pipelineType: 'vc' | 'municipal';
  action: string;
  dryRun: boolean;
  useDirectApi: boolean;
}

export interface DryRunStats {
  discovered?: number;
  validated?: number;
  researched?: number;
  personalized?: number;
  sent?: number;
  failed?: number;
  skipped?: number;
  reason?: string;
}

/**
 * DiscordReporter - Generates and sends dry-run reports to Discord
 */
export class DiscordReporter {
  private webhookUrl: string | null;
  private outputDir: string;
  private dryRunId: string;
  private timestamp: string;

  constructor(options: { webhookUrl?: string; outputDir?: string } = {}) {
    this.webhookUrl = options.webhookUrl || process.env.DISCORD_WEBHOOK_URL || null;
    this.outputDir = options.outputDir || path.join(process.cwd(), 'data', 'dry-run', 'reports');
    this.timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.dryRunId = `dry-run-${this.timestamp}`;
    
    this.ensureOutputDir();
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Load credentials for webhook URL
   */
  private loadWebhookUrl(): string | null {
    if (this.webhookUrl) return this.webhookUrl;
    
    const credentialsPath = path.resolve(__dirname, '../../../config/credentials.json');
    try {
      if (fs.existsSync(credentialsPath)) {
        const creds = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        if (creds?.discord?.webhookUrl) {
          return creds.discord.webhookUrl;
        }
      }
    } catch { /* ignore */ }
    
    // Legacy fallback
    const legacyPath = path.join(process.env.HOME || '/home/andlersrv', '.openclaw/workspace/config/credentials.json');
    try {
      if (fs.existsSync(legacyPath)) {
        const creds = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        if (creds?.discord?.webhookUrl) {
          return creds.discord.webhookUrl;
        }
      }
    } catch { /* ignore */ }
    
    return null;
  }

  /**
   * Format a number with comma separators
   */
  private formatNumber(num: number): string {
    return num.toLocaleString();
  }

  /**
   * Generate summary embed for Discord
   */
  private generateSummaryEmbed(
    type: 'vc' | 'municipal',
    action: string,
    stats: DryRunStats,
    notionSim?: NotionSimulator,
    supabaseSim?: SupabaseSimulator
  ): Record<string, unknown> {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
    
    // Type-specific details
    fields.push({ name: 'Type', value: type === 'vc' ? 'Venture Capital' : 'Municipal Government', inline: true });
    fields.push({ name: 'Action', value: action, inline: true });
    fields.push({ name: 'Mode', value: 'Dry Run + Direct API', inline: true });
    
    // Stats
    if (stats.discovered !== undefined) {
      fields.push({ name: '🔍 Discovered', value: this.formatNumber(stats.discovered), inline: true });
    }
    if (stats.validated !== undefined) {
      fields.push({ name: '✓ Validated', value: this.formatNumber(stats.validated), inline: true });
    }
    if (stats.researched !== undefined) {
      fields.push({ name: '📚 Researched', value: this.formatNumber(stats.researched), inline: true });
    }
    if (stats.personalized !== undefined) {
      fields.push({ name: '✉️ Personalized', value: this.formatNumber(stats.personalized), inline: true });
    }
    if (stats.sent !== undefined) {
      fields.push({ name: '🚀 Sent', value: this.formatNumber(stats.sent), inline: true });
    }
    if (stats.failed !== undefined && stats.failed > 0) {
      fields.push({ name: '❌ Failed', value: this.formatNumber(stats.failed), inline: true });
    }
    if (stats.skipped !== undefined && stats.skipped > 0) {
      fields.push({ name: '⏭️ Skipped', value: `${this.formatNumber(stats.skipped)}${stats.reason ? `\n${stats.reason}` : ''}`, inline: false });
    }
    
    // Simulation stats
    if (notionSim) {
      fields.push({ name: '📝 Notion Pages (sim)', value: this.formatNumber(notionSim.getCount()), inline: true });
    }
    if (supabaseSim) {
      const muniCount = supabaseSim.getMunicipalityCount();
      const vcCount = supabaseSim.getPoliticalFigureCount();
      fields.push({ name: '💾 DB Records (sim)', value: `Muni: ${muniCount}, VC: ${vcCount}`, inline: true });
    }
    
    return {
      title: `🤖 Alygn Outreach Dry Run Report`,
      color: 0x7C3AED, // Purple
      fields,
      footer: {
        text: `Dry Run ID: ${this.dryRunId} | ${new Date().toLocaleString()}`
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Generate detailed entity list embed
   */
  private generateEntityListEmbed(
    entities: Array<{ name: string; email?: string | null; website?: string | null }>,
    title: string
  ): Record<string, unknown> {
    if (entities.length === 0) {
      return {
        title,
        color: 0x6B7280,
        description: 'No entities'
      };
    }
    
    // Take first 10 entities for Discord message limits
    const displayEntities = entities.slice(0, 10);
    const hasMore = entities.length > 10;
    
    const lines = displayEntities.map(e => {
      const emailStr = e.email ? `\n   📧 ${e.email}` : '';
      const websiteStr = e.website ? `\n   🌐 ${e.website}` : '';
      return `**${e.name}**${emailStr}${websiteStr}`;
    });
    
    if (hasMore) {
      lines.push(`\n*... and ${entities.length - 10} more*`);
    }
    
    return {
      title: `${title} (${entities.length})`,
      color: 0x10B981, // Green
      description: lines.join('\n\n'),
      footer: {
        text: 'Dry Run - No actual emails sent'
      }
    };
  }

  /**
   * Generate the full report as a structured document
   */
  generateReport(
    type: 'vc' | 'municipal',
    action: string,
    stats: DryRunStats,
    entities: Array<{ name: string; email?: string | null; website?: string | null }>,
    notionSim?: NotionSimulator,
    supabaseSim?: SupabaseSimulator
  ): { embeds: Record<string, unknown>[]; markdown: string } {
    const embeds: Record<string, unknown>[] = [];
    
    // Summary embed
    embeds.push(this.generateSummaryEmbed(type, action, stats, notionSim, supabaseSim));
    
    // Entity list embed
    if (entities.length > 0) {
      embeds.push(this.generateEntityListEmbed(entities, type === 'vc' ? 'VC Firms' : 'Municipalities'));
    }
    
    // Markdown version for saving
    const markdown = this.generateMarkdownReport(type, action, stats, entities, notionSim, supabaseSim);
    
    return { embeds, markdown };
  }

  /**
   * Generate markdown report
   */
  private generateMarkdownReport(
    type: 'vc' | 'municipal',
    action: string,
    stats: DryRunStats,
    entities: Array<{ name: string; email?: string | null; website?: string | null }>,
    notionSim?: NotionSimulator,
    supabaseSim?: SupabaseSimulator
  ): string {
    let md = `# Alygn Outreach Dry Run Report\n\n`;
    md += `**Date:** ${new Date().toLocaleString()}\n`;
    md += `**Type:** ${type === 'vc' ? 'Venture Capital' : 'Municipal Government'}\n`;
    md += `**Action:** ${action}\n`;
    md += `**Mode:** Dry Run + Direct API\n`;
    md += `**Dry Run ID:** ${this.dryRunId}\n\n`;
    
    md += `## 📊 Statistics\n\n`;
    if (stats.discovered !== undefined) md += `- **Discovered:** ${stats.discovered}\n`;
    if (stats.validated !== undefined) md += `- **Validated:** ${stats.validated}\n`;
    if (stats.researched !== undefined) md += `- **Researched:** ${stats.researched}\n`;
    if (stats.personalized !== undefined) md += `- **Personalized:** ${stats.personalized}\n`;
    if (stats.sent !== undefined) md += `- **Sent:** ${stats.sent}\n`;
    if (stats.failed !== undefined) md += `- **Failed:** ${stats.failed}\n`;
    if (stats.skipped !== undefined) md += `- **Skipped:** ${stats.skipped}${stats.reason ? ` (${stats.reason})` : ''}\n`;
    
    if (notionSim || supabaseSim) {
      md += `\n## 🧪 Simulation Layer\n\n`;
      if (notionSim) {
        md += `- **Notion Pages Created:** ${notionSim.getCount()}\n`;
      }
      if (supabaseSim) {
        md += `- **Supabase Records:**\n`;
        md += `  - Municipalities: ${supabaseSim.getMunicipalityCount()}\n`;
        md += `  - Local Governments: ${supabaseSim.getLocalGovernmentCount()}\n`;
        md += `  - Outreach Emails: ${supabaseSim.getOutreachEmailCount()}\n`;
        md += `  - Political Figures: ${supabaseSim.getPoliticalFigureCount()}\n`;
      }
    }
    
    md += `\n## 📋 Entities (${entities.length})\n\n`;
    for (const entity of entities.slice(0, 20)) {
      md += `### ${entity.name}\n`;
      if (entity.email) md += `- Email: ${entity.email}\n`;
      if (entity.website) md += `- Website: ${entity.website}\n`;
      md += '\n';
    }
    if (entities.length > 20) {
      md += `*... and ${entities.length - 20} more*\n`;
    }
    
    return md;
  }

  /**
   * Save report to file
   */
  saveReport(
    type: 'vc' | 'municipal',
    action: string,
    stats: DryRunStats,
    entities: Array<{ name: string; email?: string | null; website?: string | null }>,
    notionSim?: NotionSimulator,
    supabaseSim?: SupabaseSimulator
  ): { jsonFile: string; mdFile: string } {
    const { embeds, markdown } = this.generateReport(type, action, stats, entities, notionSim, supabaseSim);
    
    const jsonFile = path.join(this.outputDir, `${this.dryRunId}-report.json`);
    fs.writeFileSync(jsonFile, JSON.stringify({ embeds, dryRunId: this.dryRunId, timestamp: this.timestamp }, null, 2));
    
    const mdFile = path.join(this.outputDir, `${this.dryRunId}-report.md`);
    fs.writeFileSync(mdFile, markdown);
    
    console.log(`\n   💾 Report saved:`);
    console.log(`      JSON: ${jsonFile}`);
    console.log(`      Markdown: ${mdFile}`);
    
    return { jsonFile, mdFile };
  }

  /**
   * Send report to Discord webhook
   */
  async sendToDiscord(
    type: 'vc' | 'municipal',
    action: string,
    stats: DryRunStats,
    entities: Array<{ name: string; email?: string | null; website?: string | null }>,
    notionSim?: NotionSimulator,
    supabaseSim?: SupabaseSimulator
  ): Promise<boolean> {
    const webhookUrl = this.loadWebhookUrl();
    
    if (!webhookUrl) {
      console.log('   ⚠️  No Discord webhook URL configured - skipping Discord notification');
      console.log('   📝 Save the report locally instead:');
      this.saveReport(type, action, stats, entities, notionSim, supabaseSim);
      return false;
    }
    
    const { embeds } = this.generateReport(type, action, stats, entities, notionSim, supabaseSim);
    
    // Split embeds if too many (Discord limits to 10 per message)
    const chunks = [];
    for (let i = 0; i < embeds.length; i += 10) {
      chunks.push(embeds.slice(i, i + 10));
    }
    
    try {
      for (const chunk of chunks) {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'Alygn Outreach',
            avatar_url: 'https://alygn.org/logo.png',
            embeds: chunk
          })
        });
        
        if (!response.ok) {
          throw new Error(`Discord API error: ${response.status}`);
        }
      }
      
      console.log(`   ✅ Discord report sent successfully (${chunks.length} message(s))`);
      return true;
      
    } catch (error) {
      console.error(`   ❌ Failed to send Discord report: ${(error as Error).message}`);
      console.log('   📝 Saving report locally instead:');
      this.saveReport(type, action, stats, entities, notionSim, supabaseSim);
      return false;
    }
  }

  /**
   * Full report flow: generate, save, and optionally send to Discord
   */
  async report(
    type: 'vc' | 'municipal',
    action: string,
    stats: DryRunStats,
    entities: Array<{ name: string; email?: string | null; website?: string | null }>,
    options: { sendToDiscord?: boolean; notionSim?: NotionSimulator; supabaseSim?: SupabaseSimulator } = {}
  ): Promise<{ jsonFile: string; mdFile: string; sentToDiscord: boolean }> {
    const { sendToDiscord = true, notionSim, supabaseSim } = options;
    
    console.log('\n📊 Generating dry-run report...');
    
    // Save locally
    const { jsonFile, mdFile } = this.saveReport(type, action, stats, entities, notionSim, supabaseSim);
    
    // Send to Discord if requested
    let sentToDiscord = false;
    if (sendToDiscord) {
      sentToDiscord = await this.sendToDiscord(type, action, stats, entities, notionSim, supabaseSim);
    }
    
    return { jsonFile, mdFile, sentToDiscord };
  }

  /**
   * Get current dry run ID
   */
  getDryRunId(): string {
    return this.dryRunId;
  }
}

/**
 * Create a singleton reporter for dry-run mode
 */
let reporterInstance: DiscordReporter | null = null;

export function getDiscordReporter(options?: { webhookUrl?: string; outputDir?: string }): DiscordReporter {
  if (!reporterInstance) {
    reporterInstance = new DiscordReporter(options);
  }
  return reporterInstance;
}

export function resetDiscordReporter(): void {
  reporterInstance = null;
}

export default DiscordReporter;
