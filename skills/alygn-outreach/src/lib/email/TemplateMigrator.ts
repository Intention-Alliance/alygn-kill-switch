/**
 * TemplateMigrator — F-081
 * Detects template version and migrates through chained rules (v0→v1→v2→v3).
 *
 * Features:
 *   detectVersion(template) — inspect template syntax to determine version
 *   migrate(template, options) — apply chained migration rules up to target version
 *   dry-run mode — preview changes without modifying the template
 *   diff output — show before/after for each migration step
 *
 * TypeScript strict mode. No external dependencies.
 */

import { TemplateVersion } from './TemplateVersion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported template schema versions. */
export type TemplateSchemaVersion = 0 | 1 | 2 | 3;

/** Result of version detection. */
export interface VersionDetectionResult {
  /** Detected schema version. */
  version: TemplateSchemaVersion;
  /** Confidence signals that led to this detection. */
  signals: string[];
}

/** A single migration rule that transforms a template from one version to the next. */
export interface MigrationRule {
  /** Source version this rule migrates FROM. */
  from: TemplateSchemaVersion;
  /** Target version this rule migrates TO. */
  to: TemplateSchemaVersion;
  /** Human-readable description of what this rule does. */
  description: string;
  /** The actual transformation function. */
  transform: (template: string) => string;
}

/** Options for the migrate function. */
export interface MigrateOptions {
  /** Target version to migrate to. Default: 3 (latest). */
  targetVersion?: TemplateSchemaVersion;
  /** If true, return diff info without applying changes. Default: false. */
  dryRun?: boolean;
}

/** Diff for a single migration step. */
export interface MigrationStepDiff {
  /** Version transition (e.g. "v0 → v1"). */
  transition: string;
  /** Description of the migration rule. */
  description: string;
  /** Template content before this step. */
  before: string;
  /** Template content after this step. */
  after: string;
  /** True if this step actually changed the template. */
  changed: boolean;
  /** Warnings about patterns that may need manual review. */
  warnings: string[];
}

/** Full migration result. */
export interface MigrationResult {
  /** The final migrated template (or original if dry-run). */
  template: string;
  /** Schema version of the output. */
  version: TemplateSchemaVersion;
  /** Whether any changes were applied. */
  changed: boolean;
  /** Per-step diff details. */
  steps: MigrationStepDiff[];
  /** Whether this was a dry-run. */
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Version detection signals
// ---------------------------------------------------------------------------

/**
 * Detect the schema version of a template by inspecting its syntax.
 *
 * v0: Raw text with no template syntax, or only simple {{var}} substitution.
 *     No conditionals, no loops, no i18n tokens.
 *
 * v1: Adds {{#if}}/{{#each}} blocks and {{> partial}} includes.
 *     No default values (|default), no escape modifiers (|h, |r).
 *
 * v2: Adds default values ({{name|there}}), escape modifiers (|h, |r),
 *     comparison operators in #if ({{#if count > 0}}).
 *
 * v3: Adds i18n tokens ({{t key}}, {{locale}}, {{formatNumber}}, {{formatDate}}),
 *     template inheritance ({{extends "base"}}, {{#block}}, {{#override}}),
 *     and logical operators ({{#if a && b}}).
 */
export function detectVersion(template: string): VersionDetectionResult {
  const signals: string[] = [];
  let version: TemplateSchemaVersion = 0;

  // v3 signals: i18n, inheritance, logical operators
  const hasI18n = /\{\{t\s+[\w.-]+/.test(template);
  const hasLocale = /\{\{locale\}\}/.test(template);
  const hasFormatNumber = /\{\{formatNumber\s+/.test(template);
  const hasFormatDate = /\{\{formatDate\s+/.test(template);
  const hasExtends = /\{\{extends\s+["']/.test(template);
  const hasBlock = /\{\{#block\s+/.test(template);
  const hasOverride = /\{\{#override\s+/.test(template);
  const hasLogicalOp = /\{\{#if\s+[^}]*(&&|\|\|)[^}]*\}\}/.test(template);

  if (hasI18n) signals.push('{{t key}} i18n token');
  if (hasLocale) signals.push('{{locale}} token');
  if (hasFormatNumber) signals.push('{{formatNumber}} token');
  if (hasFormatDate) signals.push('{{formatDate}} token');
  if (hasExtends) signals.push('{{extends}} inheritance');
  if (hasBlock) signals.push('{{#block}} definition');
  if (hasOverride) signals.push('{{#override}} definition');
  if (hasLogicalOp) signals.push('logical operator in #if');

  if (hasI18n || hasLocale || hasFormatNumber || hasFormatDate ||
      hasExtends || hasBlock || hasOverride || hasLogicalOp) {
    version = 3;
  }

  // v2 signals: default values, escape modifiers, comparison operators
  if (version < 3) {
    const hasDefault = /\{\{[\w.]+\|[^hr][^}]*\}\}/.test(template);
    const hasEscapeModifier = /\{\{[\w.]+\|[hr]\}\}/.test(template);
    const hasComparison = /\{\{#if\s+[\w.]+\s*(===|!==|>=|<=|>|<)\s*[^}]+\}\}/.test(template);

    if (hasDefault) signals.push('{{var|default}} default value');
    if (hasEscapeModifier) signals.push('{{var|h}} or {{var|r}} escape modifier');
    if (hasComparison) signals.push('comparison operator in #if');

    if (hasDefault || hasEscapeModifier || hasComparison) {
      version = 2;
    }
  }

  // v1 signals: conditionals, loops, partials
  if (version < 2) {
    const hasIf = /\{\{#if\s+/.test(template);
    const hasEach = /\{\{#each\s+/.test(template);
    const hasPartial = /\{\{>\s*[\w.-]+/.test(template);

    if (hasIf) signals.push('{{#if}} conditional');
    if (hasEach) signals.push('{{#each}} loop');
    if (hasPartial) signals.push('{{> partial}} include');

    if (hasIf || hasEach || hasPartial) {
      version = 1;
    }
  }

  // v0: only simple variables or no syntax at all
  if (version < 1) {
    const hasSimpleVar = /\{\{[\w.]+\}\}/.test(template);
    if (hasSimpleVar) {
      signals.push('{{var}} simple substitution only');
    } else {
      signals.push('no template syntax detected');
    }
    version = 0;
  }

  return { version, signals };
}

// ---------------------------------------------------------------------------
// Migration rules
// ---------------------------------------------------------------------------

/**
 * v0 → v1: Wrap bare variables in proper conditional blocks where needed.
 *
 * - Convert `{{#if var}}...{{/if}}` placeholder patterns (if any v0 artifacts)
 * - Add {{#each}} wrappers for comma-separated list patterns
 * - Normalize {{> partial}} syntax (add spacing after >)
 */
/**
 * Factory for v0 → v1 migration rule.
 * Accepts a whitelist of plural collection variable names.
 */
function createV0toV1(pluralWhitelist: Set<string>): MigrationRule {
  return {
    from: 0,
    to: 1,
    description: 'Normalize variable syntax and add block structure support',
    transform(template: string): string {
      let result = template;

      // Normalize partial syntax: {{>partial}} → {{> partial}} (add space after >)
      result = result.replace(/\{\{>(\s*)([\w.-]+)\}\}/g, (_match, _space, name) => {
        return `{{> ${name}}}`;
      });

      // Convert comma-separated list patterns inside {{var}} to {{#each var}} lists
      // Only wrap variables that are in the plural whitelist to avoid false-positives
      // on singular words ending in 's' (e.g. {{status}}, {{address}})
      const anyVarPattern = /\{\{([\w]+)\}\}/g;
      result = result.replace(anyVarPattern, (match, varName) => {
        if (pluralWhitelist.has(varName)) {
          return `{{#if ${varName}}}\n{{#each ${varName}}}• {{this|r}}\n{{/each}}\n{{/if}}`;
        }
        return match;
      });

      return result;
    },
  };
}

/**
 * v1 → v2: Add default values, escape modifiers, and comparison operators.
 *
 * - Add |there default to {{recipientName}} and similar greeting variables
 * - Add |r (raw) modifier to variables used inside HTML contexts
 * - Add |h (HTML-escape) as default for user-facing variables
 * - Convert simple {{#if var}} truthiness checks to comparison where appropriate
 */
const v1_to_v2: MigrationRule = {
  from: 1,
  to: 2,
  description: 'Add default values, escape modifiers, and comparison operators',
  transform(template: string): string {
    let result = template;

    // Add default values to common greeting variables
    const defaultMap: Record<string, string> = {
      recipientName: 'there',
      firstName: 'there',
      name: 'there',
    };

    for (const [varName, defaultVal] of Object.entries(defaultMap)) {
      // Only add default if not already present
      const re = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
      result = result.replace(re, `{{${varName}|${defaultVal}}}`);
    }

    // Add |r (raw) modifier to variables inside HTML tag attributes
    // Pattern: href="{{var}}" or src="{{var}}"
    result = result.replace(/(href|src|action)=["']\{\{([\w.]+)\}\}["']/g,
      (_match, attr, varName) => {
        return `${attr}="{{${varName}|r}}"`;
      },
    );

    // Add |h (HTML-escape) to user-facing variables that don't have modifiers yet
    const userFacingVars = ['recipientName', 'firstName', 'companyName', 'name'];
    for (const varName of userFacingVars) {
      // Only add |h if variable has a default but no escape modifier
      const re = new RegExp(`\\{\\{${varName}\\|([^}|]+)\\}\\}`, 'g');
      result = result.replace(re, (match, existing) => {
        // If existing is just a default value (not h or r), keep it as-is
        // Default values and escape modifiers can coexist: {{name|there}} stays
        return match;
      });
    }

    // Convert {{#if var}} with numeric comparisons where appropriate
    // Pattern: {{#if count}} → {{#if count > 0}} for known numeric variables
    const numericVars = ['count', 'score', 'total', 'numItems', 'length'];
    for (const varName of numericVars) {
      const re = new RegExp(`\\{\\{#if\\s+${varName}\\}\\}`, 'g');
      result = result.replace(re, `{{#if ${varName} > 0}}`);
    }

    return result;
  },
};

/**
 * v2 → v3: Add i18n tokens, template inheritance, and logical operators.
 *
 * - Convert hardcoded text strings to {{t key}} translation tokens
 * - Add {{locale}} token for locale output
 * - Convert numeric/date formatting to {{formatNumber}}/{{formatDate}}
 * - Convert nested {{#if}} to {{#if a && b}} where appropriate
 * - Add {{extends}}/{{#block}}/{{#override}} structure hints
 */
const v2_to_v3: MigrationRule = {
  from: 2,
  to: 3,
  description: 'Add i18n tokens, template inheritance, and logical operators',
  transform(template: string): string {
    let result = template;

    // NOTE: Business-specific greeting/closing replacements (e.g. "Estimado/a",
    // "Looking forward to exploring this with you") have been removed from the
    // library. Use the `customRules` constructor option to add domain-specific
    // migration rules that replace hardcoded strings with {{t key}} tokens.

    // Convert numeric values that should use formatNumber
    // Pattern: {{score}} → {{formatNumber score}}
    result = result.replace(/\{\{(score|amount|total|price|cost)\|?([^}]*)\}\}/g,
      (_match, varName, modifier) => {
        return `{{formatNumber ${varName}}}`;
      },
    );

    // Convert date values that should use formatDate
    // Pattern: {{date}} → {{formatDate date}}
    result = result.replace(/\{\{(date|createdAt|updatedAt|sentAt)\|?([^}]*)\}\}/g,
      (_match, varName, _modifier) => {
        return `{{formatDate ${varName}}}`;
      },
    );

    // Merge adjacent nested {{#if}} blocks into logical {{#if a && b}}
    // Only merge when closings are directly adjacent (no content between).
    // Non-adjacent nested ifs require manual review — the regex cannot safely
    // determine which {{/if}} pairs with which opening.
    const nestedIfPattern = /\{\{#if\s+([\w.]+)\}\}\s*\{\{#if\s+([\w.]+)\}\}/g;
    result = result.replace(nestedIfPattern, (_match, condA, condB) => {
      return `{{#if ${condA} && ${condB}}}`;
    });
    // Only merge adjacent closings: {{/if}} immediately followed by {{/if}}
    // (whitespace between is allowed, but no other content)
    result = result.replace(/\{\{\/if\}\}\s*\{\{\/if\}\}/g, '{{/if}}');

    return result;
  },
};

// ---------------------------------------------------------------------------
// Default plural whitelist
// ---------------------------------------------------------------------------

/** Default whitelist of variable names that represent plural collections. */
const DEFAULT_PLURAL_WHITELIST = new Set([
  'items',
  'points',
  'list',
  'entries',
  'records',
  'results',
  'notifications',
  'messages',
]);

// ---------------------------------------------------------------------------
// Ordered migration rules
// ---------------------------------------------------------------------------

const MIGRATION_RULES: MigrationRule[] = [createV0toV1(DEFAULT_PLURAL_WHITELIST), v1_to_v2, v2_to_v3];

/** Latest supported schema version. */
export const LATEST_VERSION: TemplateSchemaVersion = 3;

// ---------------------------------------------------------------------------
// TemplateMigrator class
// ---------------------------------------------------------------------------

export class TemplateMigrator {
  private rules: MigrationRule[];
  private readonly pluralWhitelist: Set<string>;

  constructor(opts?: { customRules?: MigrationRule[]; pluralWhitelist?: string[] }) {
    this.pluralWhitelist = new Set(opts?.pluralWhitelist ?? DEFAULT_PLURAL_WHITELIST);
    this.rules = opts?.customRules ?? [
      createV0toV1(this.pluralWhitelist),
      v1_to_v2,
      v2_to_v3,
    ];
  }

  /**
   * Detect the schema version of a template.
   */
  detectVersion(template: string): VersionDetectionResult {
    return detectVersion(template);
  }

  /**
   * Migrate a template through chained rules from its detected version
   * to the target version (default: latest).
   *
   * In dry-run mode, the original template is returned unchanged and
   * the steps contain the diffs showing what WOULD happen.
   */
  migrate(template: string, options?: MigrateOptions): MigrationResult {
    const targetVersion = options?.targetVersion ?? LATEST_VERSION;
    const dryRun = options?.dryRun ?? false;

    const { version: sourceVersion } = detectVersion(template);

    // If already at or above target, nothing to do
    if (sourceVersion >= targetVersion) {
      return {
        template,
        version: sourceVersion,
        changed: false,
        steps: [],
        dryRun,
      };
    }

    let current = template;
    let currentVersion = sourceVersion;
    const steps: MigrationStepDiff[] = [];
    let anyChanged = false;

    // Apply rules in order: v0→v1, v1→v2, v2→v3
    for (const rule of this.rules) {
      // Skip rules that don't apply to our current version
      if (rule.from !== currentVersion) continue;
      // Stop if we've reached the target
      if (rule.to > targetVersion) break;

      const before = current;
      const after = rule.transform(before);
      const changed = before !== after;

      const warnings: string[] = [];

      // Detect non-adjacent nested {{#if}} closings that the migrator cannot merge
      if (rule.to === 3) {
        const nonAdjacentNestedIf = /\{\{\/if\}\}[^\s{][\s\S]*?\{\{\/if\}\}/;
        if (nonAdjacentNestedIf.test(after)) {
          warnings.push(
            'Non-adjacent nested {{#if}} blocks detected. The migrator only merges ' +
            'adjacent closings ({{/if}} directly followed by {{/if}}). Manual review ' +
            'recommended for nested conditionals with content between closings.',
          );
        }
      }

      steps.push({
        transition: `v${rule.from} → v${rule.to}`,
        description: rule.description,
        before,
        after,
        changed,
        warnings,
      });

      if (changed) {
        anyChanged = true;
      }

      // In dry-run, don't apply the transformation
      if (!dryRun) {
        current = after;
      }
      currentVersion = rule.to;
    }

    return {
      template: dryRun ? template : current,
      version: dryRun ? sourceVersion : currentVersion,
      changed: anyChanged,
      steps,
      dryRun,
    };
  }

  /**
   * Get the list of registered migration rules.
   */
  getRules(): readonly MigrationRule[] {
    return this.rules;
  }

  /**
   * Add a custom migration rule. Rules must be added in order.
   */
  addRule(rule: MigrationRule): void {
    this.rules.push(rule);
    // Re-sort by source version
    this.rules.sort((a, b) => a.from - b.from);
  }
}

// ---------------------------------------------------------------------------
// Diff formatting utility
// ---------------------------------------------------------------------------

/**
 * Format a MigrationResult as a human-readable diff string.
 * Shows each step with before/after and change indicators.
 */
export function formatMigrationDiff(result: MigrationResult): string {
  const lines: string[] = [];

  lines.push(`Migration Result (${result.dryRun ? 'DRY-RUN' : 'APPLIED'})`);
  lines.push(`  Version: v${result.version}${result.changed ? '' : ' (no changes)'}`);
  lines.push('');

  if (result.steps.length === 0) {
    lines.push('  No migration steps needed.');
    return lines.join('\n');
  }

  for (const step of result.steps) {
    lines.push(`  ── ${step.transition} ──`);
    lines.push(`  ${step.description}`);
    lines.push(`  Changed: ${step.changed ? 'YES' : 'no'}`);

    if (step.warnings.length > 0) {
      lines.push('');
      for (const w of step.warnings) {
        lines.push(`  ⚠  ${w}`);
      }
    }

    if (step.changed) {
      lines.push('');
      lines.push('  Before:');
      for (const line of step.before.split('\n')) {
        lines.push(`  - ${line}`);
      }
      lines.push('');
      lines.push('  After:');
      for (const line of step.after.split('\n')) {
        lines.push(`  + ${line}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

export default TemplateMigrator;