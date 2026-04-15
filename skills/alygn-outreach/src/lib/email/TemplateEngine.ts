/**
 * TemplateEngine — F-074
 * Synchronous template variable substitution engine.
 *
 * Features:
 *   Variable substitution:  {{name}}, {{company}}, {{painPoints}}
 *   Default values:         {{name|there}}   — "there" if name is empty
 *   HTML escaping:          {{name|h}}        — HTML-escaped output
 *   Raw output:             {{name|r}}         — no escaping
 *   Conditional blocks:     {{#if painPoints}}...{{/if}}
 *   Loops:                  {{#each painPoints}}• {{this}}{{/each}}
 *
 * All operations are synchronous pure functions (< 5ms per template).
 * No external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateData {
  [key: string]: unknown;
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

function resolvePath(data: TemplateData, path: string): unknown {
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

interface BlockNode {
  type: 'text' | 'variable' | 'if' | 'each';
  text?: string;
  token?: TokenSpec;
  conditionPath?: string;
  iteratorPath?: string;
  children?: BlockNode[];
  body?: BlockNode[];
  elseBody?: BlockNode[];
}

/**
 * Parse template string into an AST of BlockNodes.
 * Handles: {{var}}, {{#if path}}...{{else}}...{{/if}}, {{#each path}}...{{/each}}
 */
function parseTemplate(template: string): BlockNode[] {
  const nodes: BlockNode[] = [];
  // Regex matches: {{{raw}}} (triple), {{#if path}}, {{#each path}}, {{else}}, {{/if}}, {{/each}}, {{token}}
  const tokenRe = new RegExp('\\{\\{\\{(.+?)\\}\\}\\}\\}|\\{\\{(#if\\s+[\\w.]+|#each\\s+[\\w.]+|else|/if|/each|[^}]+)\\}\\}', 'g');

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

    // {{#if path}}
    const ifMatch = inner.match(/^#if\s+([\w.]+)$/);
    if (ifMatch) {
      const blockNode: BlockNode = {
        type: 'if',
        conditionPath: ifMatch[1],
        body: [],
        elseBody: [],
      };
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
// Rendering
// ---------------------------------------------------------------------------

function renderNodes(
  nodes: BlockNode[],
  data: TemplateData,
  insideEach: boolean,
): string {
  const parts: string[] = [];

  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        parts.push(node.text ?? '');
        break;

      case 'variable': {
        const spec = node.token!;
        const raw = resolvePath(data, spec.path);
        let str = coerceString(raw);

        // Apply default if empty
        if (str === '' && spec.default !== undefined) {
          str = spec.default;
        }

        // Escaping: inside #each, default is raw; outside, default is escape
        if (spec.escapeMode === 'h') {
          str = escapeHtml(str);
        } else if (spec.escapeMode === 'r') {
          // raw, no escaping
        } else if (!insideEach) {
          // Default outside #each: HTML-escape for safety
          str = escapeHtml(str);
        }
        // Inside #each without explicit mode: raw (caller controls HTML)

        parts.push(str);
        break;
      }

      case 'if': {
        const condValue = resolvePath(data, node.conditionPath!);
        if (isTruthy(condValue)) {
          parts.push(renderNodes(node.body ?? [], data, insideEach));
        } else {
          parts.push(renderNodes(node.elseBody ?? [], data, insideEach));
        }
        break;
      }

      case 'each': {
        const arr = resolvePath(data, node.iteratorPath!);
        if (Array.isArray(arr)) {
          for (const item of arr) {
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
            parts.push(renderNodes(node.body ?? [], iterData, true));
          }
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
  /**
   * Render a template string with the given data.
   *
   * @param template - Template string with {{token}}, {{#if}}, {{#each}} etc.
   * @param data - Key-value pairs for substitution.
   * @returns Rendered string with all tokens resolved.
   */
  render(template: string, data: TemplateData): string {
    const ast = parseTemplate(template);
    return renderNodes(ast, data, false);
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
    const re = /\{\{(#if\s+|#each\s+)?([\w.|]+)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(template)) !== null) {
      if (match[1]) {
        // Block opener — extract the path after #if or #each
        const path = match[2].trim();
        vars.add(path);
      } else {
        // Variable token — extract path (before |)
        const expr = match[2].trim();
        const path = expr.split('|')[0].trim();
        if (path !== 'else' && path !== '/if' && path !== '/each' && path !== 'this') {
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