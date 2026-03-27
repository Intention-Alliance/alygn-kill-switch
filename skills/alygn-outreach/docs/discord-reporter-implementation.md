# DiscordReporter Implementation Guide

## Overview

The `DiscordReporter` class generates and sends formatted dry-run reports to Discord. It follows the report format defined in `discord-report-format.md`.

## File Structure

```
src/
├── reporting/
│   ├── DiscordReporter.ts    # Main reporter class
│   ├── report-templates.ts   # Markdown templates
│   └── types.ts              # Reporting type definitions
```

## Implementation

### 1. Type Definitions

**File:** `src/reporting/types.ts`

```typescript
/**
 * Reporting types for Discord dry-run reports
 */

import type { IOutreachEntity, IEmailValidation } from "../entities/types.js";

/** Stage of the pipeline */
export type ReportStage =
  | "discover"
  | "validate"
  | "research"
  | "personalize"
  | "send";

/** Entity type */
export type ReportEntityType = "vc" | "municipal";

/** API call record */
export interface IApiCall {
  name: string;
  status: "success" | "partial" | "failed" | "skipped";
  durationMs: number;
  requestSummary: string;
  responseSummary?: string;
  error?: string;
}

/** Database simulation record */
export interface IDatabaseSimulation {
  notion?: {
    wouldCreate: number;
    wouldUpdate: number;
    databaseName: string;
    filePath: string;
  };
  supabase?: {
    wouldInsert: number;
    wouldUpdate: number;
    tables: string[];
    filePath: string;
  };
}

/** Validation result in report */
export interface IValidationReport {
  email: string;
  status: "valid" | "invalid" | "risky" | "unknown";
  confidence: number;
  validator: string;
  reason?: string;
}

/** Action item for next steps */
export interface IActionItem {
  text: string;
  completed?: boolean;
}

/** Complete dry-run report data */
export interface IDryRunReport {
  timestamp: Date;
  entityType: ReportEntityType;
  stage: ReportStage;
  entityCount: number;
  apiCalls: IApiCall[];
  entities: IOutreachEntity[];
  databaseSimulation: IDatabaseSimulation;
  validations: IValidationReport[];
  recommendations: string[];
  actionItems: IActionItem[];
  stateFilePath: string;
  productionSummary: string;
  filterInfo?: {
    draftStatus?: string;
    sendToList?: string[];
    passedCount: number;
    totalCount: number;
  };
}

/** Discord message chunk (for splitting long reports) */
export interface IMessageChunk {
  content: string;
  isContinuation: boolean;
}

/** Reporter configuration */
export interface IReporterConfig {
  webhookUrl?: string;
  maxMessageLength: number;
  includeFullJson: boolean;
  maxEntitiesToShow: number;
  maxJsonLines: number;
}
```

### 2. Report Templates

**File:** `src/reporting/report-templates.ts`

````typescript
/**
 * Markdown templates for Discord dry-run reports
 */

import type {
  IDryRunReport,
  IApiCall,
  IValidationReport,
  IActionItem,
  ReportEntityType,
  ReportStage,
} from "./types.js";

// Emoji mappings
const EMOJI = {
  header: "🧪",
  timestamp: "📅",
  target: "🎯",
  api: "📡",
  data: "📊",
  database: "💾",
  success: "✅",
  warning: "⚠️",
  error: "❌",
  skipped: "⏸️",
  nextSteps: "🚀",
  actionItems: "📝",
  duration: "⏱️",
  email: "📧",
  municipal: "🏛️",
  vc: "💼",
  document: "📄",
} as const;

// Status emoji helpers
function getStatusEmoji(status: string): string {
  const map: Record<string, string> = {
    success: EMOJI.success,
    valid: EMOJI.success,
    partial: EMOJI.warning,
    risky: EMOJI.warning,
    failed: EMOJI.error,
    invalid: EMOJI.error,
    skipped: EMOJI.skipped,
    unknown: EMOJI.warning,
  };
  return map[status] || EMOJI.warning;
}

// Format timestamp
function formatTimestamp(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

// Format duration
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// Format entity type + stage
function formatAction(
  entityType: ReportEntityType,
  stage: ReportStage,
): string {
  const typeLabel = entityType === "vc" ? "VC" : "Municipal";
  const stageLabel = stage.charAt(0).toUpperCase() + stage.slice(1);
  return `${typeLabel} ${stageLabel}`;
}

/**
 * Generate report header
 */
export function generateHeader(report: IDryRunReport): string {
  const lines = [
    `${EMOJI.header} **Pre-Production Dry-Run Report**`,
    `${EMOJI.timestamp} ${formatTimestamp(report.timestamp)}`,
    `${EMOJI.target} ${formatAction(report.entityType, report.stage)} (${report.entityCount} entities)`,
  ];
  return lines.join("\n");
}

/**
 * Generate API calls section
 */
export function generateApiSection(apiCalls: IApiCall[]): string {
  if (apiCalls.length === 0) {
    return `${EMOJI.api} **API Calls**\nNo external API calls made.`;
  }

  const lines = [`${EMOJI.api} **API Calls**`];

  for (const call of apiCalls) {
    const statusEmoji = getStatusEmoji(call.status);
    const duration = formatDuration(call.durationMs);
    lines.push(
      `- ${statusEmoji} **${call.name}**: ${call.status} (${duration})`,
    );
    lines.push(`  - Request: ${call.requestSummary}`);
    if (call.responseSummary) {
      const summary =
        call.responseSummary.length > 100
          ? call.responseSummary.slice(0, 100) + "..."
          : call.responseSummary;
      lines.push(`  - Response: ${summary}`);
    }
    if (call.error) {
      lines.push(`  - ${EMOJI.error} Error: ${call.error}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate entity sample JSON (truncated)
 */
export function generateEntityJson(
  entity: IOutreachEntity,
  maxLines: number = 15,
): string {
  const json = JSON.stringify(
    {
      id: entity.id,
      name: entity.name,
      email: entity.email,
      website: entity.website,
      location: entity.location,
      typeData: entity.typeData,
      personalizationContext: entity.personalizationContext,
    },
    null,
    2,
  );

  const lines = json.split("\n");
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines).join("\n") + "\n  ... // truncated";
  }
  return json;
}

/**
 * Generate key fields section
 */
export function generateKeyFields(entityType: ReportEntityType): string {
  const lines = ["**Key Fields Populated:**"];

  // Base fields
  lines.push("- ✅ Name, Email, Website");
  lines.push("- ✅ Location data");

  // Type-specific fields
  if (entityType === "vc") {
    lines.push("- ✅ Firm type, Stage focus, Sector focus");
    lines.push("- ✅ Relevance score");
  } else {
    lines.push("- ✅ Government type, Population, Province");
    lines.push("- ✅ Pain points, Key contacts");
  }

  return lines.join("\n");
}

/**
 * Generate data retrieved section
 */
export function generateDataSection(
  report: IDryRunReport,
  maxEntities: number = 2,
): string {
  const lines = [
    `${EMOJI.data} **Data Retrieved** (${report.entityCount} entities)`,
  ];

  const entitiesToShow = report.entities.slice(0, maxEntities);

  for (let i = 0; i < entitiesToShow.length; i++) {
    const entity = entitiesToShow[i];
    lines.push("");
    lines.push(`**Entity ${i + 1}: ${entity.name}**`);
    lines.push("```json");
    lines.push(generateEntityJson(entity, report.maxJsonLines || 15));
    lines.push("```");
  }

  if (report.entityCount > maxEntities) {
    lines.push(`*... and ${report.entityCount - maxEntities} more entities*`);
  }

  lines.push("");
  lines.push(generateKeyFields(report.entityType));

  // Filter info (for send stage)
  if (report.filterInfo && report.filterInfo.totalCount > 0) {
    lines.push("");
    lines.push("**Send Filter Applied:**");
    if (report.filterInfo.draftStatus) {
      lines.push(`- Draft Status: \`${report.filterInfo.draftStatus}\``);
    }
    if (
      report.filterInfo.sendToList &&
      report.filterInfo.sendToList.length > 0
    ) {
      lines.push(`- Send List: ${report.filterInfo.sendToList.join(", ")}`);
    }
    lines.push(
      `- Match: ${report.filterInfo.passedCount}/${report.filterInfo.totalCount} entities passed filters`,
    );
  }

  return lines.join("\n");
}

/**
 * Generate database simulation section
 */
export function generateDatabaseSection(
  simulation: IDatabaseSimulation,
): string {
  const lines = [`${EMOJI.database} **Database Simulation**`];

  if (simulation.notion) {
    lines.push(
      `- **Notion**: Would create ${simulation.notion.wouldCreate} pages, update ${simulation.notion.wouldUpdate}`,
    );
    lines.push(`  - Database: ${simulation.notion.databaseName}`);
    lines.push(`  - Simulated file: \`${simulation.notion.filePath}\``);
  }

  if (simulation.supabase) {
    lines.push(
      `- **Supabase**: Would insert ${simulation.supabase.wouldInsert} rows`,
    );
    lines.push(`  - Tables: ${simulation.supabase.tables.join(", ")}`);
    lines.push(`  - Simulated file: \`${simulation.supabase.filePath}\``);
  }

  return lines.join("\n");
}

/**
 * Generate validation section
 */
export function generateValidationSection(
  validations: IValidationReport[],
): string {
  if (validations.length === 0) {
    return `${EMOJI.success} **Validation Results**\nNo email validation performed.`;
  }

  const lines = [`${EMOJI.success} **Validation Results**`];
  lines.push("");
  lines.push("| Email | Status | Confidence | Validator |");
  lines.push("|-------|--------|------------|-----------|");

  for (const v of validations) {
    const statusEmoji = getStatusEmoji(v.status);
    lines.push(
      `| ${v.email} | ${statusEmoji} ${v.status} | ${v.confidence}% | ${v.validator} |`,
    );
  }

  // Issues found
  const issues = validations.filter(
    (v) => v.status === "invalid" || v.status === "risky",
  );
  if (issues.length > 0) {
    lines.push("");
    lines.push("**Issues Found:**");
    for (const issue of issues) {
      lines.push(
        `- ${EMOJI.warning} ${issue.email}: ${issue.reason || "Validation issue"}`,
      );
    }
  }

  return lines.join("\n");
}

/**
 * Generate next steps section
 */
export function generateNextStepsSection(report: IDryRunReport): string {
  const lines = [`${EMOJI.nextSteps} **Next Steps**`];

  // Production summary
  lines.push(`- **In Production:**`);
  lines.push(`  - ${report.productionSummary}`);

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push("");
    lines.push("- **Recommendations:**");
    for (const rec of report.recommendations) {
      lines.push(`  - ${rec}`);
    }
  }

  // Action items
  if (report.actionItems.length > 0) {
    lines.push("");
    lines.push(`${EMOJI.actionItems} **Action Items:**`);
    for (const item of report.actionItems) {
      const checkbox = item.completed ? "[x]" : "[ ]";
      lines.push(`  - ${checkbox} ${item.text}`);
    }
  }

  // State file reference
  lines.push("");
  lines.push(`${EMOJI.document} **Full Data:**`);
  lines.push(`- State file: \`${report.stateFilePath}\``);

  return lines.join("\n");
}

/**
 * Generate complete report
 */
export function generateReport(report: IDryRunReport): string {
  const sections = [
    generateHeader(report),
    generateApiSection(report.apiCalls),
    generateDataSection(report, report.maxEntitiesToShow || 2),
    generateDatabaseSection(report.databaseSimulation),
    generateValidationSection(report.validations),
    generateNextStepsSection(report),
  ];

  return sections.join("\n\n");
}
````

### 3. DiscordReporter Class

**File:** `src/reporting/DiscordReporter.ts`

````typescript
/**
 * DiscordReporter - Generates and sends dry-run reports to Discord
 */

import type {
  IDryRunReport,
  IReporterConfig,
  IMessageChunk,
  IApiCall,
  IValidationReport,
  IActionItem,
  ReportStage,
  ReportEntityType,
} from "./types.js";
import * as templates from "./report-templates.js";

// Default configuration
const DEFAULT_CONFIG: IReporterConfig = {
  maxMessageLength: 1900, // Leave buffer for Discord limit
  includeFullJson: false,
  maxEntitiesToShow: 2,
  maxJsonLines: 15,
};

/**
 * DiscordReporter class
 *
 * Usage:
 * ```typescript
 * const reporter = new DiscordReporter({ webhookUrl: '...' });
 * await reporter.sendDryRunReport(reportData);
 * ```
 */
export class DiscordReporter {
  private config: IReporterConfig;
  private webhookUrl?: string;

  constructor(config: Partial<IReporterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.webhookUrl = config.webhookUrl;
  }

  /**
   * Set webhook URL
   */
  setWebhookUrl(url: string): void {
    this.webhookUrl = url;
  }

  /**
   * Build complete report data from pipeline results
   */
  buildReport(options: {
    entityType: ReportEntityType;
    stage: ReportStage;
    entityCount: number;
    entities: IOutreachEntity[];
    apiCalls: IApiCall[];
    validations?: IValidationReport[];
    stateFilePath: string;
    databaseSimulation?: IDatabaseSimulation;
    filterInfo?: IDryRunReport["filterInfo"];
  }): IDryRunReport {
    const timestamp = new Date();

    // Generate production summary based on stage
    const productionSummary = this.generateProductionSummary(
      options.stage,
      options.entityCount,
      options.entityType,
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      options.stage,
      options.validations || [],
    );

    // Generate action items
    const actionItems = this.generateActionItems(
      options.stage,
      options.entityType,
    );

    return {
      timestamp,
      entityType: options.entityType,
      stage: options.stage,
      entityCount: options.entityCount,
      apiCalls: options.apiCalls,
      entities: options.entities,
      databaseSimulation: options.databaseSimulation || {
        notion: undefined,
        supabase: undefined,
      },
      validations: options.validations || [],
      recommendations,
      actionItems,
      stateFilePath: options.stateFilePath,
      productionSummary,
      filterInfo: options.filterInfo,
      maxEntitiesToShow: this.config.maxEntitiesToShow,
      maxJsonLines: this.config.maxJsonLines,
    };
  }

  /**
   * Generate production summary text
   */
  private generateProductionSummary(
    stage: ReportStage,
    count: number,
    entityType: ReportEntityType,
  ): string {
    const typeLabel = entityType === "vc" ? "VC firms" : "municipalities";
    const emailLabel = entityType === "vc" ? "emails" : "emails (Spanish)";

    switch (stage) {
      case "discover":
        return `${count} ${typeLabel} would be discovered and stored in the database.`;
      case "validate":
        return `${count} email addresses would be validated using configured validator.`;
      case "research":
        return `${count} ${typeLabel} would be enriched with research data.`;
      case "personalize":
        return `${count} personalized ${emailLabel} would be generated and saved as drafts.`;
      case "send":
        return `${count} emails would be sent via Smartlead/SMTP.`;
      default:
        return `${count} entities would be processed.`;
    }
  }

  /**
   * Generate recommendations based on stage and validations
   */
  private generateRecommendations(
    stage: ReportStage,
    validations: IValidationReport[],
  ): string[] {
    const recommendations: string[] = [];

    // Stage-specific recommendations
    switch (stage) {
      case "discover":
        recommendations.push("✅ Data looks complete - proceed to validation");
        break;
      case "validate":
        const invalidCount = validations.filter(
          (v) => v.status === "invalid",
        ).length;
        const riskyCount = validations.filter(
          (v) => v.status === "risky",
        ).length;

        if (invalidCount === 0 && riskyCount === 0) {
          recommendations.push("✅ All emails validated - ready for research");
        } else {
          if (invalidCount > 0) {
            recommendations.push(
              `⚠️ ${invalidCount} invalid emails found - review before proceeding`,
            );
          }
          if (riskyCount > 0) {
            recommendations.push(
              `⚠️ ${riskyCount} risky emails found - consider validation options`,
            );
          }
        }
        break;
      case "research":
        recommendations.push(
          "✅ Research complete - proceed to personalization",
        );
        break;
      case "personalize":
        recommendations.push(
          "✅ Personalization complete - awaiting human approval",
        );
        recommendations.push("Review drafts in Notion before sending");
        break;
      case "send":
        recommendations.push("✅ All filters passed - ready to send");
        recommendations.push("Drafts approved by human review");
        break;
    }

    return recommendations;
  }

  /**
   * Generate action items based on stage
   */
  private generateActionItems(
    stage: ReportStage,
    entityType: ReportEntityType,
  ): IActionItem[] {
    const items: IActionItem[] = [];
    const typeFlag = entityType === "vc" ? "vc" : "municipal";

    switch (stage) {
      case "discover":
        items.push({ text: `Run: --type=${typeFlag} --action=validate` });
        break;
      case "validate":
        items.push({ text: `Run: --type=${typeFlag} --action=research` });
        break;
      case "research":
        items.push({ text: `Run: --type=${typeFlag} --action=personalize` });
        break;
      case "personalize":
        items.push({ text: "Review drafts in Notion" });
        items.push({ text: "Approve/reject each draft" });
        items.push({ text: "Run send action with approved IDs" });
        break;
      case "send":
        items.push({ text: "Final review: Check subject lines" });
        items.push({ text: `Run: --action=send --dry-run=false` });
        break;
    }

    return items;
  }

  /**
   * Split report into chunks that fit Discord's message limit
   */
  private splitIntoChunks(report: string): IMessageChunk[] {
    if (report.length <= this.config.maxMessageLength) {
      return [{ content: report, isContinuation: false }];
    }

    const chunks: IMessageChunk[] = [];
    const sections = report.split("\n\n");
    let currentChunk = "";

    for (const section of sections) {
      // If adding this section would exceed limit, start new chunk
      if (
        currentChunk.length + section.length + 2 >
        this.config.maxMessageLength
      ) {
        if (currentChunk) {
          chunks.push({
            content: currentChunk.trim(),
            isContinuation: chunks.length > 0,
          });
        }
        currentChunk = section;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n\n${section}` : section;
      }
    }

    // Add remaining content
    if (currentChunk) {
      chunks.push({
        content: currentChunk.trim(),
        isContinuation: chunks.length > 0,
      });
    }

    return chunks;
  }

  /**
   * Send report to Discord
   */
  async sendReport(report: IDryRunReport): Promise<void> {
    if (!this.webhookUrl) {
      console.log("No Discord webhook configured - report not sent");
      console.log(
        "Set webhookUrl in DiscordReporter config to enable Discord notifications",
      );
      return;
    }

    // Generate full report
    const fullReport = templates.generateReport(report);

    // Split into chunks if needed
    const chunks = this.splitIntoChunks(fullReport);

    // Send each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const content = chunk.isContinuation
        ? `*(continued ${i + 1}/${chunks.length})*\n\n${chunk.content}`
        : chunk.content;

      await this.sendToDiscord(content);

      // Small delay between messages to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    console.log(`Discord report sent in ${chunks.length} message(s)`);
  }

  /**
   * Send message to Discord webhook
   */
  private async sendToDiscord(content: string): Promise<void> {
    const response = await fetch(this.webhookUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        username: "Alygn Outreach",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Discord webhook failed: ${response.status} ${errorText}`,
      );
    }
  }

  /**
   * Send dry-run report (convenience method)
   */
  async sendDryRunReport(report: IDryRunReport): Promise<void> {
    return this.sendReport(report);
  }

  /**
   * Log report to console instead of sending (for debugging)
   */
  logReport(report: IDryRunReport): void {
    const fullReport = templates.generateReport(report);
    console.log("\n" + "=".repeat(60));
    console.log("DISCORD DRY-RUN REPORT");
    console.log("=".repeat(60));
    console.log(fullReport);
    console.log("=".repeat(60) + "\n");
  }
}

export default DiscordReporter;
````

### 4. Integration with Pipeline

**File:** `src/core/Pipeline.ts` (additions)

```typescript
// Add to imports
import { DiscordReporter } from "../reporting/DiscordReporter.js";
import type {
  IDryRunReport,
  IApiCall,
  IValidationReport,
} from "../reporting/types.js";

// Add to Pipeline class
export class Pipeline {
  private discordReporter?: DiscordReporter;
  private apiCalls: IApiCall[] = [];

  constructor(type: "vc" | "municipal", config: Record<string, unknown> = {}) {
    // ... existing constructor code ...

    // Initialize Discord reporter if webhook configured
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      this.discordReporter = new DiscordReporter({ webhookUrl });
    }
  }

  /**
   * Track API call for reporting
   */
  private trackApiCall(call: IApiCall): void {
    this.apiCalls.push(call);
  }

  /**
   * Clear tracked API calls
   */
  private clearApiCalls(): void {
    this.apiCalls = [];
  }

  /**
   * Send dry-run report to Discord
   */
  private async sendDryRunReport(
    stage: ReportStage,
    entities: OutreachEntity[],
    stateFilePath: string,
    options: {
      validations?: IValidationReport[];
      filterInfo?: IDryRunReport["filterInfo"];
    } = {},
  ): Promise<void> {
    if (!this.discordReporter) {
      return;
    }

    const report = this.discordReporter.buildReport({
      entityType: this.type,
      stage,
      entityCount: entities.length,
      entities,
      apiCalls: this.apiCalls,
      validations: options.validations,
      stateFilePath,
      databaseSimulation: {
        notion: {
          wouldCreate: stage === "discover" ? entities.length : 0,
          wouldUpdate: stage === "send" ? entities.length : 0,
          databaseName: "Outreach Pipeline",
          filePath: `data/dry-run/notion-${this.type}-${new Date().toISOString().split("T")[0]}.json`,
        },
        supabase: {
          wouldInsert: entities.length,
          wouldUpdate: stage === "send" ? entities.length : 0,
          tables:
            stage === "send"
              ? ["outreach_emails", "municipalities"]
              : ["municipalities"],
          filePath: `data/dry-run/supabase-${this.type}-${new Date().toISOString().split("T")[0]}.json`,
        },
      },
      filterInfo: options.filterInfo,
    });

    await this.discordReporter.sendReport(report);
    this.clearApiCalls();
  }

  // Example usage in runDiscover:
  async runDiscover(options: {
    dryRun: boolean;
    limit: number;
    region?: string | null;
  }): Promise<StageResult> {
    // ... existing code ...

    // Track API calls
    const startTime = Date.now();
    const discovered = await strategy.discover(query, {
      dryRun,
      limit,
      region,
    });
    this.trackApiCall({
      name: "Perplexity API",
      status: discovered.length > 0 ? "success" : "failed",
      durationMs: Date.now() - startTime,
      requestSummary: `Query: "${query}", Limit: ${limit}`,
    });

    // ... rest of existing code ...

    // Send Discord report if dry-run
    if (dryRun && this.discordReporter) {
      await this.sendDryRunReport("discover", discovered, stateFile);
    }

    return {
      action: "discover",
      dryRun,
      discovered: discovered.length,
      results: discovered.map((e) => ({
        id: e.id,
        name: e.name,
        email: e.email,
        website: e.website,
      })),
      stateFile,
    };
  }
}
```

### 5. Environment Configuration

Add to `.env` or environment variables:

```bash
# Discord webhook for dry-run reports
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...

# Optional: Disable Discord reports even if webhook is set
# DISABLE_DISCORD_REPORTS=true
```

### 6. Usage Examples

**Basic Usage:**

```typescript
import { DiscordReporter } from "./src/reporting/DiscordReporter.js";
import type {
  IDryRunReport,
  IApiCall,
  IValidationReport,
} from "./src/reporting/types.js";

// Initialize reporter
const reporter = new DiscordReporter({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  maxEntitiesToShow: 2,
  maxJsonLines: 15,
});

// Build report from pipeline results
const report = reporter.buildReport({
  entityType: "vc",
  stage: "discover",
  entityCount: 5,
  entities: discoveredEntities,
  apiCalls: [
    {
      name: "Perplexity API",
      status: "success",
      durationMs: 1200,
      requestSummary: 'Query: "AI safety venture capital"',
    },
  ],
  stateFilePath:
    "/home/andlersrv/.openclaw/workspace/reports/alygn/vc-discover/alygn-vc-discovered-2026-03-27.json",
});

// Send to Discord
await reporter.sendDryRunReport(report);

// Or just log to console (for testing)
reporter.logReport(report);
```

**With Validation Results:**

```typescript
const report = reporter.buildReport({
  entityType: "vc",
  stage: "validate",
  entityCount: 3,
  entities: entities,
  apiCalls: apiCalls,
  validations: [
    {
      email: "contact@aisafetyvc.com",
      status: "valid",
      confidence: 95,
      validator: "zerobounce",
    },
    {
      email: "info@example.com",
      status: "risky",
      confidence: 60,
      validator: "regex-mx",
      reason: "Disposable email domain",
    },
  ],
  stateFilePath:
    "/home/andlersrv/.openclaw/workspace/reports/alygn/vc-validate/alygn-vc-validated-2026-03-27.json",
});
```

**With Send Filters:**

```typescript
const report = reporter.buildReport({
  entityType: "vc",
  stage: "send",
  entityCount: 2,
  entities: approvedEntities,
  apiCalls: [],
  stateFilePath:
    "/home/andlersrv/.openclaw/workspace/reports/alygn/vc-sent/alygn-vc-sent-2026-03-27.json",
  filterInfo: {
    draftStatus: "Approved",
    sendToList: ["entity-abc123", "entity-def456"],
    passedCount: 2,
    totalCount: 5,
  },
});
```

## Testing

```typescript
// Test report generation
import { DiscordReporter } from "./src/reporting/DiscordReporter.js";

const reporter = new DiscordReporter();

const mockReport = reporter.buildReport({
  entityType: "vc",
  stage: "discover",
  entityCount: 2,
  entities: [], // mock entities
  apiCalls: [],
  stateFilePath:
    "/home/andlersrv/.openclaw/workspace/reports/alygn/vc-discover/test.json",
});

// Log to console
reporter.logReport(mockReport);
```

## Future Enhancements

1. **Embeds**: Use Discord embeds for richer formatting
2. **Attachments**: Upload full JSON files as attachments
3. **Threading**: Create threaded discussions for long reports
4. **Reactions**: Add reaction buttons for quick approvals
5. **Scheduled Reports**: Send summary reports on a schedule
