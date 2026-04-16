/**
 * TemplateSyntaxValidator — F-082
 * Validates template syntax before rendering: balanced tags, valid expressions,
 * required variables, and inheritance consistency.
 *
 * Complements the existing TemplateValidator (F-072) which validates email
 * content (HTML structure, size, language). This validator focuses on the
 * template engine's own syntax: {{var}}, {{#if}}, {{#each}}, {{> partial}},
 * {{extends}}, {{#block}}, {{#override}}.
 *
 * All operations are synchronous pure functions (< 5ms per template).
 * No external dependencies.
 */

import { extractExtends, parseTemplate } from './TemplateEngine';
import type { TemplateData } from './TemplateEngine';
import type { TemplateRegistry } from './TemplateRegistry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  rule: string;
  message: string;
  detail?: string;
  line?: number;
}

export interface ValidationReport {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

// ---------------------------------------------------------------------------
// Syntax validation
// ---------------------------------------------------------------------------

/**
 * Check balanced block tags: every {{#if}} has {{/if}}, every {{#each}} has {{/each}},
 * every {{#block}} has {{/block}}, every {{#override}} has {{/override}}.
 * Also checks for stray {{else}} outside {{#if}} blocks.
 */
function validateBalancedTags(template: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = template.split('\n');

  const stack: { tag: string; name: string; line: number }[] = [];
  const blockOpenRe = /\{\{#(if|each|block|override)\s+([^}]+)\}\}/g;
  const closeRe = /\{\{\/(if|each|block|override)\}\}/g;
  const elseRe = /\{\{else\}\}/g;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Find all open tags on this line
    let match: RegExpExecArray | null;
    const openRe = new RegExp(blockOpenRe.source, blockOpenRe.flags);
    while ((match = openRe.exec(line)) !== null) {
      stack.push({ tag: match[1], name: match[2].trim(), line: lineNum });
    }

    // Find all close tags on this line
    const clRe = new RegExp(closeRe.source, closeRe.flags);
    while ((match = clRe.exec(line)) !== null) {
      const closeTag = match[1];
      // Pop matching open tag
      const top = stack.pop();
      if (!top) {
        issues.push({
          severity: 'error',
          rule: 'balanced-tags',
          message: `Closing {{/${closeTag}}} without matching opening tag`,
          line: lineNum,
        });
      } else if (top.tag !== closeTag) {
        issues.push({
          severity: 'error',
          rule: 'balanced-tags',
          message: `Mismatched tags: {{#${top.tag} ${top.name}}} closed by {{/${closeTag}}}`,
          line: lineNum,
        });
        // Push back the unmatched open tag
        stack.push(top);
      }
    }

    // Check for stray {{else}}
    const elRe = new RegExp(elseRe.source, elseRe.flags);
    while ((elRe.exec(line)) !== null) {
      const topTag = stack[stack.length - 1];
      if (!topTag || topTag.tag !== 'if') {
        issues.push({
          severity: 'error',
          rule: 'balanced-tags',
          message: `{{else}} found outside {{#if}} block`,
          line: lineNum,
        });
      }
    }
  }

  // Any remaining open tags are unclosed
  for (const unclosed of stack) {
    issues.push({
      severity: 'error',
      rule: 'balanced-tags',
      message: `Unclosed {{#${unclosed.tag} ${unclosed.name}}} (opened at line ${unclosed.line})`,
      line: unclosed.line,
    });
  }

  return issues;
}

/**
 * Check for valid expressions inside {{...}} tokens.
 * Flags obviously malformed tokens like {{#if}}, {{#each}}, empty tokens {{}},
 * and invalid characters in variable paths.
 */
function validateExpressions(template: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = template.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Find all {{ ... }} tokens (including triple-brace)
    const tokenRe = /\{\{\{(.+?)\}\}\}|\{\{(.+?)\}\}/g;
    let match: RegExpExecArray | null;

    while ((match = tokenRe.exec(line)) !== null) {
      const inner = (match[1] || match[2]).trim();

      // Empty token {{}}
      if (inner.length === 0) {
        issues.push({
          severity: 'error',
          rule: 'valid-expressions',
          message: 'Empty template token {{}}',
          line: lineNum,
        });
        continue;
      }

      // Block openers with missing arguments
      if (inner === '#if' || inner === '#each' || inner === '#block' || inner === '#override') {
        issues.push({
          severity: 'error',
          rule: 'valid-expressions',
          message: `Block tag {{${inner}}} is missing its required argument`,
          line: lineNum,
        });
        continue;
      }

      // Variable tokens with invalid characters (not a block, partial, or special)
      const isSpecial = inner.startsWith('#') || inner.startsWith('/') || inner.startsWith('>') ||
        inner === 'else' || inner === 'locale' || inner.startsWith('t ') ||
        inner.startsWith('formatNumber ') || inner.startsWith('formatDate ');

      if (!isSpecial) {
        // Variable path: allow alphanumeric, dots, dashes, underscores, pipes, @
        // Also allow |default and |h/|r modifiers
        const pathPart = inner.split('|')[0].trim();
        if (pathPart && !/^[\w.@-]+$/.test(pathPart)) {
          issues.push({
            severity: 'warning',
            rule: 'valid-expressions',
            message: `Variable path "${pathPart}" contains unusual characters`,
            line: lineNum,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Check for unclosed or stray curly braces that look like template tokens
 * but aren't properly formed (e.g., {{name}, {name}}, {{{name}}).
 */
function validateBraceConsistency(template: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lines = template.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const lineNum = lineIdx + 1;

    // Stray single braces that look like broken tokens: {something} or {{broken
    // But avoid flagging HTML attributes, CSS, or JSON
    const strayOpen = /\{\{(?![#/>\w])/g;
    let m: RegExpExecArray | null;
    while ((m = strayOpen.exec(line)) !== null) {
      const after = line.slice(m.index + 2).trimStart();
      if (after.startsWith('}') || after.length === 0) {
        issues.push({
          severity: 'warning',
          rule: 'brace-consistency',
          message: 'Possible malformed template token',
          line: lineNum,
        });
      }
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Variable validation
// ---------------------------------------------------------------------------

/**
 * Extract all variable paths referenced in a template AST.
 * Includes variables in {{var}}, {{#if path}}, {{#each path}}, {{#block name}},
 * {{#override name}}, {{> partial}}, and condition expressions.
 */
function extractVariablePaths(nodes: any[]): Set<string> {
  const vars = new Set<string>();

  function walk(nodeList: any[]): void {
    for (const node of nodeList) {
      switch (node.type) {
        case 'variable':
          if (node.token?.path && !node.token.path.startsWith('@')) {
            vars.add(node.token.path);
          }
          break;
        case 'if':
          if (node.conditionPath) vars.add(node.conditionPath);
          if (node.conditionExpr) {
            extractConditionVars(node.conditionExpr, vars);
          }
          if (node.body) walk(node.body);
          if (node.elseBody) walk(node.elseBody);
          break;
        case 'each':
          if (node.iteratorPath) vars.add(node.iteratorPath);
          if (node.body) walk(node.body);
          break;
        case 'block':
        case 'override':
          if (node.body) walk(node.body);
          break;
        case 'formatNumber':
        case 'formatDate':
          if (node.formatPath) vars.add(node.formatPath);
          break;
        case 'i18n':
        case 'text':
        case 'locale':
        case 'partial':
          break;
      }
    }
  }

  walk(nodes);
  return vars;
}

/**
 * Extract variable paths from a ConditionExpr tree.
 */
function extractConditionVars(expr: import('./TemplateEngine').ConditionExpr, vars: Set<string>): void {
  if (expr.leftPath) vars.add(expr.leftPath);
  if (expr.right) {
    if (expr.right.type === 'path') vars.add(expr.right.value);
  }
  if (expr.leftExpr) extractConditionVars(expr.leftExpr, vars);
  if (expr.rightExpr) extractConditionVars(expr.rightExpr, vars);
}

/**
 * Check which required variables are missing from the provided data.
 * Returns issues for each missing variable.
 */
function validateRequiredVars(
  template: string,
  requiredVars: string[],
  data?: TemplateData,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const varName of requiredVars) {
    if (data) {
      const segments = varName.split('.');
      let current: unknown = data;
      let found = true;
      for (const seg of segments) {
        if (current === null || current === undefined || typeof current !== 'object') {
          found = false;
          break;
        }
        if (!Object.prototype.hasOwnProperty.call(current, seg)) {
          found = false;
          break;
        }
        current = (current as Record<string, unknown>)[seg];
      }
      if (!found) {
        issues.push({
          severity: 'error',
          rule: 'required-variables',
          message: `Required variable "${varName}" is missing from provided data`,
        });
      }
    } else {
      // No data provided — just check that the template references this variable
      const varRe = new RegExp(`\\{\\{[#>]?\\s*${escapeRegExp(varName)}[\\s|}]`, 'g');
      if (!varRe.test(template)) {
        issues.push({
          severity: 'warning',
          rule: 'required-variables',
          message: `Required variable "${varName}" is not referenced in the template`,
        });
      }
    }
  }

  return issues;
}

/** Escape special regex characters in a string. */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Inheritance validation
// ---------------------------------------------------------------------------

/**
 * Validate template inheritance: {{extends "base"}} + {{#block}}/{{#override}} consistency.
 * Checks:
 * - extends references a template that exists in the registry
 * - override blocks match block definitions in the base template
 * - no orphan overrides (override without matching block in base)
 * - no circular extends chains
 */
function validateInheritanceChain(
  template: string,
  registry?: TemplateRegistry,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const baseName = extractExtends(template);
  if (!baseName) {
    // No inheritance — nothing to validate
    return issues;
  }

  // Check that registry is available
  if (!registry) {
    issues.push({
      severity: 'warning',
      rule: 'inheritance',
      message: `Template extends "${baseName}" but no TemplateRegistry is configured for validation`,
    });
    return issues;
  }

  // Check that base template exists
  const baseEntry = registry.getLatest(baseName);
  if (!baseEntry) {
    issues.push({
      severity: 'error',
      rule: 'inheritance',
      message: `Base template "${baseName}" not found in registry`,
    });
    return issues;
  }

  // Collect block names from base template
  const baseAst = parseTemplate(baseEntry.content);
  const baseBlocks = collectBlockNames(baseAst);

  // Collect override names from child template
  const childAst = parseTemplate(template);
  const childOverrides = collectOverrideNames(childAst);

  // Check for orphan overrides (override without matching block in base)
  for (const overrideName of childOverrides) {
    if (!baseBlocks.has(overrideName)) {
      issues.push({
        severity: 'warning',
        rule: 'inheritance',
        message: `Override "{{#override ${overrideName}}}" has no matching "{{#block ${overrideName}}}" in base template "${baseName}"`,
      });
    }
  }

  // Check for circular extends
  const chain: string[] = [baseName];
  let current = baseEntry.content;
  let currentName = baseName;
  while (true) {
    const nextBase = extractExtends(current);
    if (!nextBase) break;
    if (chain.includes(nextBase)) {
      issues.push({
        severity: 'error',
        rule: 'inheritance',
        message: `Circular extends detected: ${[...chain, nextBase].join(' → ')}`,
      });
      break;
    }
    if (chain.length >= 10) {
      issues.push({
        severity: 'error',
        rule: 'inheritance',
        message: `Max extends depth (10) exceeded at "${nextBase}"`,
      });
      break;
    }
    chain.push(nextBase);
    const nextEntry = registry.getLatest(nextBase);
    if (!nextEntry) {
      issues.push({
        severity: 'error',
        rule: 'inheritance',
        message: `Base template "${nextBase}" not found in registry (in extends chain)`,
      });
      break;
    }
    current = nextEntry.content;
    currentName = nextBase;
  }

  return issues;
}

/** Collect all {{#block name}} definitions from an AST. */
function collectBlockNames(nodes: any[]): Set<string> {
  const names = new Set<string>();
  function walk(list: any[]): void {
    for (const node of list) {
      if (node.type === 'block' && node.blockName) {
        names.add(node.blockName);
      }
      if (node.body) walk(node.body);
      if (node.elseBody) walk(node.elseBody);
    }
  }
  walk(nodes);
  return names;
}

/** Collect all {{#override name}} definitions from an AST. */
function collectOverrideNames(nodes: any[]): Set<string> {
  const names = new Set<string>();
  function walk(list: any[]): void {
    for (const node of list) {
      if (node.type === 'override' && node.blockName) {
        names.add(node.blockName);
      }
      if (node.body) walk(node.body);
      if (node.elseBody) walk(node.elseBody);
    }
  }
  walk(nodes);
  return names;
}

// ---------------------------------------------------------------------------
// TemplateSyntaxValidator class
// ---------------------------------------------------------------------------

export class TemplateSyntaxValidator {
  private registry?: TemplateRegistry;

  constructor(registry?: TemplateRegistry) {
    this.registry = registry;
  }

  /**
   * Validate template syntax: balanced tags, valid expressions, brace consistency.
   * Does NOT render the template — purely syntactic checks.
   */
  validateSyntax(template: string): ValidationReport {
    const allIssues: ValidationIssue[] = [
      ...validateBalancedTags(template),
      ...validateExpressions(template),
      ...validateBraceConsistency(template),
    ];

    const errors = allIssues.filter((i) => i.severity === 'error');
    const warnings = allIssues.filter((i) => i.severity === 'warning');

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate that all required variables are present in the data.
   * If data is provided, checks that each required variable resolves.
   * If data is omitted, checks that each required variable is referenced in the template.
   */
  validateVariables(template: string, requiredVars: string[], data?: TemplateData): ValidationReport {
    const issues = validateRequiredVars(template, requiredVars, data);
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate template inheritance: extends references, block/override consistency,
   * circular chain detection.
   * Requires a TemplateRegistry for full validation (warns if unavailable).
   */
  validateInheritance(template: string): ValidationReport {
    const issues = validateInheritanceChain(template, this.registry);
    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Full validation: syntax + variables + inheritance.
   */
  validate(template: string, requiredVars?: string[], data?: TemplateData): ValidationReport {
    const allIssues: ValidationIssue[] = [
      ...validateBalancedTags(template),
      ...validateExpressions(template),
      ...validateBraceConsistency(template),
    ];

    if (requiredVars) {
      allIssues.push(...validateRequiredVars(template, requiredVars, data));
    }

    if (extractExtends(template)) {
      allIssues.push(...validateInheritanceChain(template, this.registry));
    }

    const errors = allIssues.filter((i) => i.severity === 'error');
    const warnings = allIssues.filter((i) => i.severity === 'warning');

    return { valid: errors.length === 0, errors, warnings };
  }

  /** Set or update the registry (for inheritance validation). */
  setRegistry(registry: TemplateRegistry): void {
    this.registry = registry;
  }
}

export default TemplateSyntaxValidator;