/**
 * TemplateEngine — F-074 / F-076 / F-075 / F-077 / F-078 / F-079
 * Synchronous template variable substitution engine.
 *
 * Features:
 *   Variable substitution:  {{name}}, {{company}}, {{painPoints}}
 *   Default values:         {{name|there}}   — "there" if name is empty
 *   HTML escaping:          {{name|h}}        — HTML-escaped output
 *   Raw output:             {{name|r}}         — no escaping
 *   Conditional blocks:     {{#if painPoints}}...{{/if}}
 *   Comparison operators:   {{#if count > 0}}, {{#if status === "sent"}}, {{#if score >= 80}}
 *   Logical operators:      {{#if a && b}}, {{#if a || b}}, {{#if !a}}
 *   Loops:                  {{#each painPoints}}• {{this}}{{/each}}
 *   Loop context vars:      {{@index}}, {{@first}}, {{@last}}, {{@length}}
 *   Nested loops:           {{#each outer}}...{{#each inner}}...{{/each}}...{{/each}}
 *   Object iteration:      {{#each config}}{{@key}}: {{this}}{{/each}}
 *   Partials:              {{> partialName}} — include a registered partial (F-077)
 *   Template inheritance:  {{extends "base"}} + {{#block name}}...{{/block}} / {{#override name}}...{{/override}} (F-078)
 *   i18n:                  {{t key}}, {{locale}}, {{formatNumber value}}, {{formatDate value}} (F-079)
 *   Circular dependency:   Detected at render time, throws Error
 *
 * All operations are synchronous pure functions (< 5ms per template).
 * No external dependencies.
 */

import { TemplatePartial } from './TemplatePartial';
import type { TemplateRegistry } from './TemplateRegistry';
import type { TemplateI18n } from './TemplateI18n';
import type { Locale } from './Locale';
import { TemplateCache, computeCacheKey } from './TemplateCache';
import type { CacheEntry } from './TemplateCache';
import { TemplateSyntaxValidator } from './TemplateSyntaxValidator';
import type { ValidationReport } from './TemplateSyntaxValidator';
import { TemplateTester } from './TemplateTester';
import type { TestReport, TestAssertion } from './TemplateTester';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum nesting depth for partial includes (prevents stack overflow). */
const MAX_PARTIAL_DEPTH = 10;

/** Maximum inheritance chain depth (prevents infinite extends loops). */
const MAX_EXTENDS_DEPTH = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateData {
  [key: string]: unknown;
}

/** Render context for tracking partial resolution and circular deps. */
export interface RenderContext {
  /** Set of partial names currently being resolved (for circular dep detection). */
  partialChain: string[];
  /** The TemplatePartial registry instance. */
  partials?: TemplatePartial;
  /** Override map from child templates: blockName → rendered content. */
  overrides?: Map<string, BlockNode[]>;
  /** i18n instance for {{t key}} translations (F-079). */
  i18n?: TemplateI18n;
  /** Current locale for {{locale}}, {{formatNumber}}, {{formatDate}} (F-079). */
  locale?: Locale;
}

/** Loop context pushed onto stack for each #each iteration. */
interface LoopContext {
  '@index'?: number;
  '@first'?: boolean;
  '@last'?: boolean;
  '@length'?: number;
  '@key'?: string;
}

/**
 * Coerce string-valued format options to proper types for Intl APIs.
 * Numeric strings → number, boolean strings → boolean, rest pass through.
 */
function coerceFormatOpts(opts: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(opts)) {
    if (val === 'true') {
      result[key] = true;
    } else if (val === 'false') {
      result[key] = false;
    } else if (/^-?\d+(?:\.\d+)?$/.test(val)) {
      result[key] = Number(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// HTML escaping
// ---------------------------------------------------------------------------

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

// ---------------------------------------------------------------------------
// Value resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a dotted path like "user.name" from data.
 * Returns `undefined` if any segment is missing.
 */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Resolve a dotted path like "user.name" from data.
 * Also resolves loop context variables (@index, @first, @last, @length, @key)
 * from the loop stack — innermost loop wins (shadowing).
 * Returns `undefined` if any segment is missing.
 */
function resolvePath(
  data: TemplateData,
  path: string,
  loopStack: readonly LoopContext[] = [],
): unknown {
  // Loop context variables: @index, @first, @last, @length, @key
  if (path.startsWith('@')) {
    // Walk stack from top (innermost) to find first match
    for (let i = loopStack.length - 1; i >= 0; i--) {
      const ctx = loopStack[i];
      if (path in ctx) return ctx[path as keyof LoopContext];
    }
    return undefined;
  }

  const segments = path.split('.');
  let current: unknown = data;
  for (const seg of segments) {
    if (DANGEROUS_KEYS.has(seg)) return undefined;
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      if (!Object.prototype.hasOwnProperty.call(current, seg)) return undefined;
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Coerce a value to string. Arrays are joined with ", ".
 * `undefined` / `null` return empty string.
 */
function coerceString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return String(value);
}

/**
 * Check if a value is "truthy" for conditionals.
 * Empty strings, null, undefined, empty arrays → falsy.
 */
function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'boolean') return value;
  return true;
}

// ---------------------------------------------------------------------------
// Token parsing
// ---------------------------------------------------------------------------

/**
 * Parse a token expression like "name|there", "name|h", "name|r".
 * Returns { path, default, escapeMode }.
 *
 * escapeMode:
 *   'h' = HTML-escape
 *   'r' = raw (no escaping)
 *   undefined = auto (escape by default, raw inside #each)
 */
interface TokenSpec {
  path: string;
  default?: string;
  escapeMode?: 'h' | 'r';
}

function parseToken(expr: string): TokenSpec {
  const parts = expr.split('|');
  const path = parts[0].trim();
  if (parts.length === 1) return { path };

  const modifier = parts[1].trim();
  // Single-char modifiers: h (html-escape), r (raw)
  if (modifier === 'h' || modifier === 'r') {
    return { path, escapeMode: modifier };
  }

  // Otherwise it's a default value
  return { path, default: parts.slice(1).join('|').trim() };
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

/** Parsed conditional expression for #if blocks (F-075). */
export interface ConditionExpr {
  /** Raw expression string (for debugging). */
  raw: string;
  /** Simple truthy check on a single path (backward compat). */
  truthyPath?: string;
  /** Negation prefix: {{#if !a}} */
  negated?: boolean;
  /** Left operand path. */
  leftPath: string;
  /** Comparison operator, if any. */
  operator?: '===' | '!==' | '>' | '<' | '>=' | '<=';
  /** Right operand — either a resolved path or a literal value. */
  right?: { type: 'path' | 'string' | 'number'; value: string };
  /** Logical operator joining two sub-expressions. */
  logical?: '&&' | '||';
  /** Left sub-expression (for logical operators). */
  leftExpr?: ConditionExpr;
  /** Second sub-expression (after && or ||). */
  rightExpr?: ConditionExpr;
}

interface BlockNode {
  type: 'text' | 'variable' | 'if' | 'each' | 'partial' | 'block' | 'override' | 'i18n' | 'locale' | 'formatNumber' | 'formatDate';
  text?: string;
  token?: TokenSpec;
  conditionPath?: string;
  conditionExpr?: ConditionExpr;
  iteratorPath?: string;
  /** Partial name for {{> partialName}} includes. */
  partialName?: string;
  /** Block/override name for {{#block name}}...{{/block}} and {{#override name}}...{{/override}}. */
  blockName?: string;
  /** i18n translation key for {{t key}} tokens. */
  i18nKey?: string;
  /** i18n params extracted from {{t key param1=val1 param2=val2}}. */
  i18nParams?: Record<string, string>;
  /** Path for formatNumber/formatDate value resolution. */
  formatPath?: string;
  /** Format options for formatNumber (e.g. "currency", "percent", "decimal"). */
  formatStyle?: string;
  /** Extra format options (e.g. currency=USD) for formatNumber. */
  extraFormatOpts?: Record<string, string>;
  /** Date format style for formatDate (e.g. "short", "medium", "long", "full"). */
  dateStyle?: string;
  children?: BlockNode[];
  body?: BlockNode[];
  elseBody?: BlockNode[];
}

/**
 * Parse template string into an AST of BlockNodes.
 * Handles: {{var}}, {{#if path}}...{{else}}...{{/if}}, {{#each path}}...{{/each}},
 *          {{> partialName}}, {{#block name}}...{{/block}}, {{#override name}}...{{/override}}
 */
export function parseTemplate(template: string): BlockNode[] {
  const nodes: BlockNode[] = [];
  // Regex matches: {{{raw}}} (triple), {{> partialName}}, {{#if path}}, {{#each path}},
  // {{#block name}}, {{#override name}}, {{else}}, {{/if}}, {{/each}}, {{/block}}, {{/override}}, {{token}}
  const tokenRe = new RegExp('\\{\\{\\{(.+?)\\}\\}\\}\\}|\\{\\{(>\\s*[\\w.-]+|#if\\s+[^}]+|#each\\s+[\\w.]+|#block\\s+[\\w.-]+|#override\\s+[\\w.-]+|else|/if|/each|/block|/override|[^}]+)\\}\\}', 'g');

  let cursor = 0;
  let tokenMatch: RegExpExecArray | null;

  // Stack for nested blocks
  const stack: { nodes: BlockNode[]; block: BlockNode }[] = [];

  let currentNodes = nodes;

  while ((tokenMatch = tokenRe.exec(template)) !== null) {
    // Text before this token
    if (tokenMatch.index > cursor) {
      currentNodes.push({ type: 'text', text: template.slice(cursor, tokenMatch.index) });
    }
    cursor = tokenMatch.index + tokenMatch[0].length;

    const fullMatch = tokenMatch[0];

    const inner = (tokenMatch[1] || tokenMatch[2]).trim();

    // Triple-brace raw output {{{var}}}
    if (fullMatch.startsWith('{{{')) {
      currentNodes.push({ type: 'variable', token: { path: inner, escapeMode: 'r' } });
      continue;
    }

    // {{#if ...}} — simple path or full expression
    const ifSimpleMatch = inner.match(/^#if\s+([\w.]+)$/);
    const ifExprMatch = inner.match(/^#if\s+(.+)$/);
    if (ifExprMatch) {
      const exprStr = ifExprMatch[1].trim();
      const blockNode: BlockNode = {
        type: 'if',
        conditionPath: ifSimpleMatch ? ifSimpleMatch[1] : undefined,
        conditionExpr: ifSimpleMatch ? undefined : parseConditionExpr(exprStr),
        body: [],
        elseBody: [],
      };
      // For simple paths, also set conditionExpr as truthy check
      if (ifSimpleMatch) {
        blockNode.conditionExpr = { raw: exprStr, truthyPath: exprStr, leftPath: exprStr };
      }
      currentNodes.push(blockNode);
      stack.push({ nodes: currentNodes, block: blockNode });
      currentNodes = blockNode.body!;
      continue;
    }

    // {{#each path}}
    const eachMatch = inner.match(/^#each\s+([\w.]+)$/);
    if (eachMatch) {
      const blockNode: BlockNode = {
        type: 'each',
        iteratorPath: eachMatch[1],
        body: [],
      };
      currentNodes.push(blockNode);
      stack.push({ nodes: currentNodes, block: blockNode });
      currentNodes = blockNode.body!;
      continue;
    }

    // {{#block name}} — define a block with default content
    const blockMatch = inner.match(/^#block\s+([\w.-]+)$/);
    if (blockMatch) {
      const blockNode: BlockNode = {
        type: 'block',
        blockName: blockMatch[1],
        body: [],
      };
      currentNodes.push(blockNode);
      stack.push({ nodes: currentNodes, block: blockNode });
      currentNodes = blockNode.body!;
      continue;
    }

    // {{#override name}} — override a block from a base template
    const overrideMatch = inner.match(/^#override\s+([\w.-]+)$/);
    if (overrideMatch) {
      const overrideNode: BlockNode = {
        type: 'override',
        blockName: overrideMatch[1],
        body: [],
      };
      currentNodes.push(overrideNode);
      stack.push({ nodes: currentNodes, block: overrideNode });
      currentNodes = overrideNode.body!;
      continue;
    }

    // {{else}}
    if (inner === 'else') {
      const top = stack[stack.length - 1];
      if (top && top.block.type === 'if') {
        currentNodes = top.block.elseBody!;
      }
      continue;
    }

    // {{/if}}
    if (inner === '/if') {
      const top = stack.pop();
      if (top) currentNodes = top.nodes;
      continue;
    }

    // {{/each}}
    if (inner === '/each') {
      const top = stack.pop();
      if (top) currentNodes = top.nodes;
      continue;
    }

    // {{/block}}
    if (inner === '/block') {
      const top = stack.pop();
      if (top) currentNodes = top.nodes;
      continue;
    }

    // {{/override}}
    if (inner === '/override') {
      const top = stack.pop();
      if (top) currentNodes = top.nodes;
      continue;
    }

    // {{> partialName}} — partial include
    const partialMatch = inner.match(/^>\s*([\w.-]+)$/);
    if (partialMatch) {
      currentNodes.push({ type: 'partial', partialName: partialMatch[1] });
      continue;
    }

    // {{t key}} or {{t key param1=val1 param2=val2}} — i18n translation (F-079)
    const tMatch = inner.match(/^t\s+([\w.-]+)(?:\s+(.+))?$/);
    if (tMatch) {
      const i18nKey = tMatch[1];
      const i18nParams: Record<string, string> = {};
      if (tMatch[2]) {
        // Parse param=value pairs
        const paramRe = /(\w+)=([^\s"]+|"[^"]*")/g;
        let paramMatch: RegExpExecArray | null;
        while ((paramMatch = paramRe.exec(tMatch[2])) !== null) {
          let val = paramMatch[2];
          // Remove surrounding quotes if present
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1);
          }
          i18nParams[paramMatch[1]] = val;
        }
      }
      currentNodes.push({ type: 'i18n', i18nKey, i18nParams: Object.keys(i18nParams).length > 0 ? i18nParams : undefined });
      continue;
    }

    // {{locale}} — output current locale code (F-079)
    if (inner === 'locale') {
      currentNodes.push({ type: 'locale' });
      continue;
    }

    // {{formatNumber value}} or {{formatNumber value style=currency currency=USD}} — (F-079)
    const formatNumMatch = inner.match(/^formatNumber\s+([\w.]+)(?:\s+(.+))?$/);
    if (formatNumMatch) {
      const formatStyle = formatNumMatch[2];
      let fs: string | undefined;
      const extraOpts: Record<string, string> = {};
      if (formatStyle) {
        // Parse key=value pairs
        const paramRe = /(\w+)=([\w]+)/g;
        let paramMatch: RegExpExecArray | null;
        while ((paramMatch = paramRe.exec(formatStyle)) !== null) {
          if (paramMatch[1] === 'style') {
            fs = paramMatch[2];
          } else {
            extraOpts[paramMatch[1]] = paramMatch[2];
          }
        }
      }
      currentNodes.push({ type: 'formatNumber', formatPath: formatNumMatch[1], formatStyle: fs, extraFormatOpts: Object.keys(extraOpts).length > 0 ? extraOpts : undefined });
      continue;
    }

    // {{formatDate value}} or {{formatDate value style=short|medium|long|full}} — (F-079)
    const formatDateMatch = inner.match(/^formatDate\s+([\w.]+)(?:\s+style=(\w+))?$/);
    if (formatDateMatch) {
      currentNodes.push({ type: 'formatDate', formatPath: formatDateMatch[1], dateStyle: formatDateMatch[2] });
      continue;
    }

    // Regular variable token {{expr}}
    currentNodes.push({ type: 'variable', token: parseToken(inner) });
  }

  // Remaining text
  if (cursor < template.length) {
    currentNodes.push({ type: 'text', text: template.slice(cursor) });
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Conditional expression parsing & evaluation (F-075)
// ---------------------------------------------------------------------------

/**
 * Parse a conditional expression string into a ConditionExpr tree.
 *
 * Supported forms:
 *   Simple truthy:   painPoints
 *   Negation:        !a
 *   Comparison:      count > 0, status === "sent", score >= 80
 *   Logical:         a && b, a || b
 *   Combined:        !a && b, count > 0 || status === "sent"
 */
function parseConditionExpr(expr: string): ConditionExpr {
  const trimmed = expr.trim();

  // Two-pass logical parsing: || has lower precedence than &&.
  // First split on || (lowest precedence), then within each segment split on &&.
  // This ensures: a || b && c  →  a || (b && c)
  const orIdx = findTopLevelOr(trimmed);
  if (orIdx !== -1) {
    const leftStr = trimmed.slice(0, orIdx).trim();
    const rightStr = trimmed.slice(orIdx + 2).trim();
    const leftExpr = parseConditionExpr(leftStr);
    const rightExpr = parseConditionExpr(rightStr);
    return {
      raw: trimmed,
      leftPath: leftExpr.leftPath,
      logical: '||',
      leftExpr,
      rightExpr,
    };
  }
  // No || found — check for &&
  const andIdx = findTopLevelAnd(trimmed);
  if (andIdx !== -1) {
    const leftStr = trimmed.slice(0, andIdx).trim();
    const rightStr = trimmed.slice(andIdx + 2).trim();
    const leftExpr = parseConditionExpr(leftStr);
    const rightExpr = parseConditionExpr(rightStr);
    return {
      raw: trimmed,
      leftPath: leftExpr.leftPath,
      logical: '&&',
      leftExpr,
      rightExpr,
    };
  }

  // Check for negation prefix
  if (trimmed.startsWith('!')) {
    const inner = trimmed.slice(1).trim();
    const innerExpr = parseConditionExpr(inner);
    return { ...innerExpr, raw: trimmed, negated: true };
  }

  // Check for comparison operators
  const compMatch = trimmed.match(/^([\w.]+)\s*(===|!==|>=|<=|>|<)\s*(.+)$/);
  if (compMatch) {
    const leftPath = compMatch[1];
    const operator = compMatch[2] as ConditionExpr['operator'];
    const rightRaw = compMatch[3].trim();
    let right: ConditionExpr['right'];

    // String literal: "value" or 'value'
    const strMatch = rightRaw.match(/^(["'])(.*)\1$/);
    if (strMatch) {
      right = { type: 'string', value: strMatch[2] };
    } else if (/^-?\d+(?:\.\d+)?$/.test(rightRaw)) {
      right = { type: 'number', value: rightRaw };
    } else {
      right = { type: 'path', value: rightRaw };
    }

    return { raw: trimmed, leftPath, operator, right };
  }

  // Simple truthy check (no operator)
  return { raw: trimmed, truthyPath: trimmed, leftPath: trimmed };
}

/**
 * Find the index of a top-level || operator (not inside quotes).
 * || has lower precedence than &&, so we split on || first.
 * Returns -1 if none found.
 */
function findTopLevelOr(expr: string): number {
  let inQuote: string | null = null;
  for (let i = 0; i < expr.length - 1; i++) {
    const ch = expr[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === '|' && expr[i + 1] === '|') return i;
  }
  return -1;
}

/**
 * Find the index of a top-level && operator (not inside quotes).
 * Returns -1 if none found.
 */
function findTopLevelAnd(expr: string): number {
  let inQuote: string | null = null;
  for (let i = 0; i < expr.length - 1; i++) {
    const ch = expr[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      continue;
    }
    if (ch === '&' && expr[i + 1] === '&') return i;
  }
  return -1;
}

/**
 * Evaluate a ConditionExpr against template data.
 */
function evalCondition(
  expr: ConditionExpr,
  data: TemplateData,
  loopStack: readonly LoopContext[] = [],
): boolean {
  let result: boolean;

  if (expr.logical && expr.rightExpr) {
    // Use stored left sub-expression if available, otherwise build from fields
    const leftExpr = expr.leftExpr ?? {
      raw: expr.leftPath,
      leftPath: expr.leftPath,
      operator: expr.operator,
      right: expr.right,
      negated: expr.negated,
    };
    const left = evalCondition(leftExpr, data, loopStack);
    // Short-circuit: for && if left is false, skip right; for || if left is true, skip right
    if (expr.logical === '&&' && !left) {
      result = false;
    } else if (expr.logical === '||' && left) {
      result = true;
    } else {
      result = evalCondition(expr.rightExpr, data, loopStack);
    }
  } else if (expr.operator && expr.right) {
    // Comparison expression
    const leftVal = resolvePath(data, expr.leftPath, loopStack);
    const rightVal = resolveRight(expr.right, data, loopStack);
    result = compare(leftVal, rightVal, expr.operator);
  } else {
    // Simple truthy check
    const val = resolvePath(data, expr.leftPath, loopStack);
    result = isTruthy(val);
  }

  return expr.negated ? !result : result;
}

/**
 * Resolve the right-hand side of a comparison.
 */
function resolveRight(
  right: NonNullable<ConditionExpr['right']>,
  data: TemplateData,
  loopStack: readonly LoopContext[],
): unknown {
  switch (right.type) {
    case 'path':
      return resolvePath(data, right.value, loopStack);
    case 'string':
      return right.value;
    case 'number':
      return Number(right.value);
  }
}

/**
 * Compare two values with the given operator.
 */
function compare(left: unknown, right: unknown, op: ConditionExpr['operator']): boolean {
  if (op === '===') {
    // Coerce for comparison: if both are numbers, compare numerically
    if (typeof left === 'number' && typeof right === 'number') return left === right;
    return coerceString(left) === coerceString(right);
  }
  if (op === '!==') {
    if (typeof left === 'number' && typeof right === 'number') return left !== right;
    return coerceString(left) !== coerceString(right);
  }
  // Numeric comparisons
  const leftNum = typeof left === 'number' ? left : Number(left);
  const rightNum = typeof right === 'number' ? right : Number(right);
  if (Number.isNaN(leftNum) || Number.isNaN(rightNum)) return false;
  switch (op) {
    case '>': return leftNum > rightNum;
    case '<': return leftNum < rightNum;
    case '>=': return leftNum >= rightNum;
    case '<=': return leftNum <= rightNum;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Template inheritance helpers (F-078)
// ---------------------------------------------------------------------------

/**
 * Extract the {{extends "base-name"}} directive from a template.
 * Returns the base template name if found, or undefined.
 * The extends directive must appear at the top of the template (before any
 * non-whitespace content).
 */
export function extractExtends(template: string): string | undefined {
  const match = template.match(/^\s*\{\{extends\s+["']([^"']+)["']\}\}\s*/);
  return match ? match[1] : undefined;
}

/**
 * Collect all {{#override name}}...{{/override}} blocks from an AST.
 * Returns a Map of blockName → body nodes.
 */
function collectOverrides(nodes: BlockNode[]): Map<string, BlockNode[]> {
  const overrides = new Map<string, BlockNode[]>();
  for (const node of nodes) {
    if (node.type === 'override' && node.blockName) {
      overrides.set(node.blockName, node.body ?? []);
    }
  }
  return overrides;
}

/**
 * Resolve the full inheritance chain for a template.
 * Walks bottom-up through {{extends}} directives, collecting overrides at each level.
 * Returns the chain of template names from root (base) to leaf (child), and
 * the merged overrides map where child overrides take precedence.
 *
 * @param template - The template string to resolve
 * @param registry - The TemplateRegistry to load base templates from
 * @param extendsChain - Internal: tracks the chain for circular detection
 * @returns Object with base template content, merged overrides, and chain depth
 */
function resolveInheritanceChain(
  template: string,
  registry: TemplateRegistry,
  extendsChain: string[] = [],
): {
  baseTemplate: string;
  mergedOverrides: Map<string, BlockNode[]>;
  chainDepth: number;
} {
  const baseName = extractExtends(template);

  if (!baseName) {
    // This template IS the root — no inheritance
    return {
      baseTemplate: template,
      mergedOverrides: new Map(),
      chainDepth: 0,
    };
  }

  // Circular extends detection
  if (extendsChain.includes(baseName)) {
    const cycle = [...extendsChain, baseName].join(' → ');
    throw new Error(`TemplateEngine: circular extends detected: ${cycle}`);
  }

  // Max depth check
  if (extendsChain.length >= MAX_EXTENDS_DEPTH) {
    throw new Error(
      `TemplateEngine: max extends depth (${MAX_EXTENDS_DEPTH}) exceeded at "${baseName}". Chain: ${extendsChain.join(' → ')}`,
    );
  }

  // Load base template from registry
  const baseEntry = registry.getLatest(baseName);
  if (!baseEntry) {
    throw new Error(`TemplateEngine: base template "${baseName}" not found in registry`);
  }

  // Parse child template to collect its overrides (skip the {{extends}} line)
  const childAst = parseTemplate(template);
  const childOverrides = collectOverrides(childAst);

  // Recursively resolve the base template's own inheritance
  const parentResult = resolveInheritanceChain(
    baseEntry.content,
    registry,
    [...extendsChain, baseName],
  );

  // Merge: child overrides take precedence over parent overrides
  // (bottom-up: child wins over parent)
  const mergedOverrides = new Map<string, BlockNode[]>();
  // First, add all parent overrides
  for (const [name, body] of parentResult.mergedOverrides) {
    mergedOverrides.set(name, body);
  }
  // Then, child overrides overwrite parent ones
  for (const [name, body] of childOverrides) {
    mergedOverrides.set(name, body);
  }

  return {
    baseTemplate: parentResult.baseTemplate,
    mergedOverrides,
    chainDepth: parentResult.chainDepth + 1,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderNodes(
  nodes: BlockNode[],
  data: TemplateData,
  insideEach: boolean,
  loopStack: readonly LoopContext[] = [],
  renderCtx?: RenderContext,
): string {
  const parts: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        parts.push(node.text ?? '');
        break;

      case 'variable': {
        const spec = node.token!;
        const raw = resolvePath(data, spec.path, loopStack);
        let str = coerceString(raw);

        // Apply default if empty
        if (str === '' && spec.default !== undefined) {
          str = spec.default;
        }

        // Escaping: default is ALWAYS HTML-escape (including inside #each).
        // Use explicit |r modifier for raw output.
        if (spec.escapeMode === 'r') {
          // raw, no escaping
        } else {
          // Default: HTML-escape for safety (both inside and outside #each)
          str = escapeHtml(str);
        }

        parts.push(str);
        break;
      }

      case 'if': {
        const cond = node.conditionExpr ?? (node.conditionPath ? { raw: node.conditionPath, truthyPath: node.conditionPath, leftPath: node.conditionPath } as ConditionExpr : undefined);
        if (cond) {
          if (evalCondition(cond, data, loopStack)) {
            parts.push(renderNodes(node.body ?? [], data, insideEach, loopStack, renderCtx));
          } else {
            parts.push(renderNodes(node.elseBody ?? [], data, insideEach, loopStack, renderCtx));
          }
        }
        break;
      }

      case 'each': {
        const iterable = resolvePath(data, node.iteratorPath!, loopStack);

        if (Array.isArray(iterable)) {
          const len = iterable.length;
          for (let i = 0; i < len; i++) {
            const item = iterable[i];
            // Build loop context for this iteration
            const loopCtx: LoopContext = {
              '@index': i,
              '@first': i === 0,
              '@last': i === len - 1,
              '@length': len,
            };
            const nextStack = [...loopStack, loopCtx];

            // Each iteration gets `this` + original data
            const iterData: TemplateData = {
              ...data,
              this: item,
            };
            // If item is an object, spread its keys for convenience
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              const safeItem: Record<string, unknown> = {};
              for (const key of Object.keys(item)) {
                if (!DANGEROUS_KEYS.has(key)) {
                  safeItem[key] = (item as Record<string, unknown>)[key];
                }
              }
              Object.assign(iterData, safeItem);
            }
            parts.push(renderNodes(node.body ?? [], iterData, true, nextStack, renderCtx));
          }
        } else if (
          typeof iterable === 'object' &&
          iterable !== null &&
          !Array.isArray(iterable)
        ) {
          // Object iteration — iterate over own enumerable keys
          const keys = Object.keys(iterable);
          const len = keys.length;
          for (let i = 0; i < len; i++) {
            const key = keys[i];
            const value = (iterable as Record<string, unknown>)[key];
            const loopCtx: LoopContext = {
              '@index': i,
              '@first': i === 0,
              '@last': i === len - 1,
              '@length': len,
              '@key': key,
            };
            const nextStack = [...loopStack, loopCtx];

            const iterData: TemplateData = {
              ...data,
              this: value,
            };
            // If value is an object, spread its keys for convenience
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              const safeItem: Record<string, unknown> = {};
              for (const k of Object.keys(value)) {
                if (!DANGEROUS_KEYS.has(k)) {
                  safeItem[k] = (value as Record<string, unknown>)[k];
                }
              }
              Object.assign(iterData, safeItem);
            }
            parts.push(renderNodes(node.body ?? [], iterData, true, nextStack, renderCtx));
          }
        }
        break;
      }

      case 'block': {
        // Check if there's an override for this block from a child template
        const blockName = node.blockName!;
        const overrides = renderCtx?.overrides;
        if (overrides && overrides.has(blockName)) {
          // Render the override content instead of the default
          parts.push(renderNodes(overrides.get(blockName)!, data, insideEach, loopStack, renderCtx));
        } else {
          // Render the default block content
          parts.push(renderNodes(node.body ?? [], data, insideEach, loopStack, renderCtx));
        }
        break;
      }

      case 'override': {
        // Override nodes are collected during inheritance resolution,
        // not rendered directly. When rendering a child template standalone
        // (without extends), override content is simply rendered as-is.
        parts.push(renderNodes(node.body ?? [], data, insideEach, loopStack, renderCtx));
        break;
      }

      case 'partial': {
        const partialName = node.partialName!;
        const partials = renderCtx?.partials;
        if (!partials) {
          // No partials registry — leave as-is
          parts.push(`{{> ${partialName}}}`);
          break;
        }
        const partialDef = partials.get(partialName);
        if (!partialDef) {
          throw new Error(`TemplateEngine: partial "${partialName}" not found`);
        }
        // Circular dependency detection
        const chain = renderCtx.partialChain;
        if (chain.includes(partialName)) {
          const cycle = [...chain, partialName].join(' → ');
          throw new Error(`TemplateEngine: circular partial dependency detected: ${cycle}`);
        }
        // Max recursion depth check
        if (chain.length >= MAX_PARTIAL_DEPTH) {
          throw new Error(`TemplateEngine: max partial depth (${MAX_PARTIAL_DEPTH}) exceeded at "${partialName}". Chain: ${chain.join(' → ')}`);
        }
        // Merge partial defaults with current data (current data wins)
        const partialData: TemplateData = {
          ...(partialDef.defaults ?? {}),
          ...data,
        };
        // Parse and render the partial template with updated chain
        const partialAst = parseTemplate(partialDef.template);
        const partialCtx: RenderContext = {
          partialChain: [...chain, partialName],
          partials,
          overrides: renderCtx?.overrides,
          i18n: renderCtx?.i18n,
          locale: renderCtx?.locale,
        };
        parts.push(renderNodes(partialAst, partialData, insideEach, loopStack, partialCtx));
        break;
      }

      case 'i18n': {
        const i18nKey = node.i18nKey!;
        const i18n = renderCtx?.i18n;
        const locale = renderCtx?.locale;
        if (!i18n) {
          // No i18n configured — leave as-is
          parts.push(`{{t ${i18nKey}}}`);
          break;
        }
        // Resolve i18n params: first check node-level params, then resolve from data
        const resolvedParams: Record<string, string | number> = {};
        if (node.i18nParams) {
          for (const [k, v] of Object.entries(node.i18nParams)) {
            // Try resolving as data path first; fall back to literal string
            if (/^[\w.]+$/.test(v)) {
              const resolved = resolvePath(data, v, loopStack);
              if (resolved !== undefined && resolved !== null && resolved !== '') {
                resolvedParams[k] = typeof resolved === 'number' ? resolved : coerceString(resolved);
              } else {
                resolvedParams[k] = v;
              }
            } else {
              resolvedParams[k] = v;
            }
          }
        }
        parts.push(escapeHtml(i18n.t(i18nKey, locale, resolvedParams)));
        break;
      }

      case 'locale': {
        const locale = renderCtx?.locale;
        if (locale) {
          parts.push(escapeHtml(locale.code));
        } else {
          parts.push('');
        }
        break;
      }

      case 'formatNumber': {
        const locale = renderCtx?.locale;
        const raw = resolvePath(data, node.formatPath!, loopStack);
        if (locale && raw !== undefined && raw !== null) {
          const opts: Record<string, unknown> = {};
          if (node.formatStyle) {
            opts.style = node.formatStyle;
          }
          if (node.extraFormatOpts) {
            Object.assign(opts, coerceFormatOpts(node.extraFormatOpts));
          }
          parts.push(escapeHtml(locale.formatNumber(raw as number | string, opts)));
        } else {
          parts.push(coerceString(raw));
        }
        break;
      }

      case 'formatDate': {
        const locale = renderCtx?.locale;
        const raw = resolvePath(data, node.formatPath!, loopStack);
        if (locale && raw !== undefined && raw !== null) {
          const opts: Record<string, unknown> = {};
          if (node.dateStyle) {
            opts.dateStyle = node.dateStyle;
          }
          parts.push(escapeHtml(locale.formatDate(raw as Date | number | string, opts)));
        } else {
          parts.push(coerceString(raw));
        }
        break;
      }
    }
  }

  return parts.join('');
}

// ---------------------------------------------------------------------------
// TemplateEngine class
// ---------------------------------------------------------------------------

export class TemplateEngine {
  /** Partial registry for {{> partialName}} includes. */
  private partials: TemplatePartial;

  /** Template registry for {{extends "base"}} inheritance. */
  private registry?: TemplateRegistry;

  /** i18n instance for {{t key}} translations (F-079). */
  private i18n?: TemplateI18n;

  /** Current locale for {{locale}}, {{formatNumber}}, {{formatDate}} (F-079). */
  private locale?: Locale;

  /** Optional render cache (F-080). */
  private cache?: TemplateCache;

  /** Syntax validator (F-082). */
  private syntaxValidator: TemplateSyntaxValidator;

  /** Template tester (F-082). */
  private tester: TemplateTester;

  constructor(partials?: TemplatePartial, registry?: TemplateRegistry, i18n?: TemplateI18n, locale?: Locale, cache?: TemplateCache) {
    this.partials = partials ?? new TemplatePartial();
    this.registry = registry;
    this.i18n = i18n;
    this.locale = locale;
    this.cache = cache;
    this.syntaxValidator = new TemplateSyntaxValidator(registry);
    this.tester = new TemplateTester(this);
  }

  /**
   * Render a template string with the given data.
   *
   * If the template starts with {{extends "base"}}, the engine resolves the
   * inheritance chain, loads the base template from the TemplateRegistry,
   * and merges child overrides into base blocks.
   *
   * @param template - Template string with {{token}}, {{#if}}, {{#each}}, {{> partial}}, {{extends}}, {{#block}}, {{#override}} etc.
   * @param data - Key-value pairs for substitution.
   * @param partialChain - Chain of partial names for circular dep detection (internal).
   * @returns Rendered string with all tokens resolved.
   */
  render(template: string, data: TemplateData, partialChain: string[] = [], templateName?: string): string {
    // --- F-080: Cache lookup ---
    // Only cache non-inherited, top-level renders (partialChain empty)
    // Inherited templates have complex resolution; skip caching for those.
    const canCache = this.cache && partialChain.length === 0;
    let cacheKey: string | undefined;

    if (canCache) {
      cacheKey = computeCacheKey(template, data, this.locale);
      const cached = this.cache!.get(cacheKey);
      if (cached) {
        return cached.output;
      }
    }

    // --- Render ---
    let result: string;

    // Check for template inheritance
    const baseName = extractExtends(template);

    if (baseName) {
      if (!this.registry) {
        throw new Error(
          `TemplateEngine: template uses {{extends "${baseName}"}} but no TemplateRegistry is configured. Pass a registry to the constructor.`,
        );
      }

      // Resolve the full inheritance chain
      const { baseTemplate, mergedOverrides } = resolveInheritanceChain(
        template,
        this.registry,
      );

      // Parse the root base template and render with overrides applied
      const baseAst = parseTemplate(baseTemplate);
      const ctx: RenderContext = {
        partialChain,
        partials: this.partials,
        overrides: mergedOverrides,
        i18n: this.i18n,
        locale: this.locale,
      };
      result = renderNodes(baseAst, data, false, [], ctx);
    } else {
      // No inheritance — standard render
      const ast = parseTemplate(template);
      const ctx: RenderContext = {
        partialChain,
        partials: this.partials,
        i18n: this.i18n,
        locale: this.locale,
      };
      result = renderNodes(ast, data, false, [], ctx);
    }

    // --- F-080: Cache store ---
    if (canCache && cacheKey) {
      const entry: CacheEntry = {
        ast: [], // AST not stored for non-inherited renders (output is sufficient)
        output: result,
        storedAt: Date.now(),
      };
      this.cache!.set(cacheKey, entry);
      if (templateName) {
        this.cache!.associateKey(templateName, cacheKey);
      }
    }

    return result;
  }

  /**
   * Get the render cache (F-080).
   */
  getCache(): TemplateCache | undefined {
    return this.cache;
  }

  /**
   * Set the render cache (F-080).
   */
  setCache(cache: TemplateCache): void {
    this.cache = cache;
  }

  /**
   * Invalidate cache entries for a specific template name (F-080).
   */
  invalidateCache(templateName: string): number {
    if (!this.cache) return 0;
    return this.cache.invalidate(templateName);
  }

  /**
   * Invalidate all cache entries (F-080).
   */
  invalidateAllCache(): number {
    if (!this.cache) return 0;
    return this.cache.invalidateAll();
  }

  /**
   * Get the partial registry (for registering/retrieving partials).
   */
  getPartials(): TemplatePartial {
    return this.partials;
  }

  /**
   * Get the template registry (for template inheritance).
   */
  getRegistry(): TemplateRegistry | undefined {
    return this.registry;
  }

  /**
   * Set the template registry (for template inheritance).
   * Also updates the internal syntax validator's registry reference (F-082).
   */
  setRegistry(registry: TemplateRegistry): void {
    this.registry = registry;
    this.syntaxValidator.setRegistry(registry);
  }

  /**
   * Get the i18n instance (F-079).
   */
  getI18n(): TemplateI18n | undefined {
    return this.i18n;
  }

  /**
   * Set the i18n instance for {{t key}} translations (F-079).
   */
  setI18n(i18n: TemplateI18n): void {
    this.i18n = i18n;
  }

  /**
   * Get the current locale (F-079).
   */
  getLocale(): Locale | undefined {
    return this.locale;
  }

  /**
   * Set the locale for {{locale}}, {{formatNumber}}, {{formatDate}} (F-079).
   */
  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  // -----------------------------------------------------------------------
  // F-082: Validation & Testing
  // -----------------------------------------------------------------------

  /**
   * Validate template syntax, variables, and inheritance (F-082).
   * Returns a ValidationReport with errors and warnings.
   * Does NOT render the template — purely syntactic checks.
   *
   * @param template - Template string to validate
   * @param requiredVars - Optional list of required variable names
   * @param data - Optional data to check required vars against
   */
  validate(template: string, requiredVars?: string[], data?: TemplateData): ValidationReport {
    return this.syntaxValidator.validate(template, requiredVars, data);
  }

  /**
   * Run test cases against a template (F-082).
   * Each test case is a function that receives a TemplateTester and returns a TestAssertion.
   *
   * @example
   * ```ts
   * const report = engine.test('Hello {{name}}!', [
   *   (t) => t.assertRender('Hello {{name}}!', { name: 'World' }, 'Hello World!'),
   *   (t) => t.assertContains('Hello {{name}}!', { name: 'World' }, 'World'),
   * ]);
   * ```
   */
  test(
    template: string,
    testCases: Array<(tester: TemplateTester) => TestAssertion>,
  ): TestReport {
    return this.tester.test(template, testCases);
  }

  /**
   * Get the syntax validator instance (F-082).
   */
  getSyntaxValidator(): TemplateSyntaxValidator {
    return this.syntaxValidator;
  }

  /**
   * Get the template tester instance (F-082).
   */
  getTester(): TemplateTester {
    return this.tester;
  }

  /**
   * Check if a template string contains any unresolved tokens after rendering.
   * Useful for validation — any remaining {{...}} means missing data.
   */
  hasUnresolvedTokens(rendered: string): boolean {
    return /\{\{[^}]+\}\}/.test(rendered);
  }

  /**
   * Extract all variable paths referenced in a template.
   * Useful for pre-flight checks before rendering.
   */
  extractVariables(template: string): string[] {
    const vars = new Set<string>();
    const re = /\{\{(#if\s+|#each\s+|>\s*)?([\w.@|]+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(template)) !== null) {
      if (match[1] && match[1].startsWith('>')) {
        // Partial include — skip, not a variable
        continue;
      }
      if (match[1]) {
        // Block opener — extract the path after #if or #each
        const path = match[2].trim();
        vars.add(path);
      } else {
        // Variable token — extract path (before |)
        const expr = match[2].trim();
        const path = expr.split('|')[0].trim();
        if (
          path !== 'else' &&
          path !== '/if' &&
          path !== '/each' &&
          path !== 'this' &&
          !path.startsWith('@')
        ) {
          vars.add(path);
        }
      }
    }
    return Array.from(vars);
  }
}

// Singleton for convenience
export const templateEngine = new TemplateEngine();

export default TemplateEngine;