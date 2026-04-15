/**
 * TemplateOptimizer — F-073
 * Auto-reduces template size when it exceeds provider limits.
 * Non-destructive: always returns a new object.
 */

import type { EmailTemplateInput, TemplateSizeConstraints } from './TemplateValidator';
import { byteLength } from './utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OptimizationResult {
  optimized: EmailTemplateInput;
  changes: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// byteLength moved to utils.ts (F-073)

// ---------------------------------------------------------------------------
// Optimization steps (pure functions)
// ---------------------------------------------------------------------------

/** Remove HTML comments. */
function stripComments(html: string): { result: string; changed: boolean } {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, '');
  return { result: stripped, changed: stripped !== html };
}

/** Collapse multiple whitespace characters into one, preserving <pre> blocks. */
function collapseWhitespace(html: string): { result: string; changed: boolean } {
  // Protect <pre> blocks
  const preBlocks: string[] = [];
  let temp = html.replace(/<pre[\s\S]*?<\/pre>/gi, (m) => {
    preBlocks.push(m);
    return `__PRE_${preBlocks.length - 1}__`;
  });

  // Collapse runs of whitespace (not inside tags)
  let changed = false;
  const result = temp.replace(/(^|>)(\s+)([^<])/g, (_match, before, ws, after) => {
    if (ws.length > 1) {
      changed = true;
      return `${before} ${after}`;
    }
    return _match;
  });

  // Restore <pre> blocks
  let restored = result;
  for (let i = 0; i < preBlocks.length; i++) {
    restored = restored.replace(`__PRE_${i}__`, preBlocks[i]);
  }

  return { result: restored, changed };
}

/** Remove redundant inline style duplicates and empty style attributes. */
function cleanInlineStyles(html: string): { result: string; changed: boolean } {
  // Remove empty style attributes
  let cleaned = html.replace(/\s+style\s*=\s*["']\s*["']/gi, '');
  const changed = cleaned !== html;
  return { result: cleaned, changed };
}

/** Minify HTML by applying all safe reductions. */
function minifyHtml(html: string): { result: string; changes: string[] } {
  const changes: string[] = [];
  let current = html;

  const commentResult = stripComments(current);
  if (commentResult.changed) {
    changes.push('Removed HTML comments');
    current = commentResult.result;
  }

  const wsResult = collapseWhitespace(current);
  if (wsResult.changed) {
    changes.push('Collapsed extra whitespace');
    current = wsResult.result;
  }

  const styleResult = cleanInlineStyles(current);
  if (styleResult.changed) {
    changes.push('Cleaned empty inline styles');
    current = styleResult.result;
  }

  return { result: current, changes };
}

/** Truncate text body to fit within byte limit. */
function truncateText(
  text: string,
  maxBytes: number,
): { result: string; changed: boolean } {
  const currentBytes = byteLength(text);
  if (currentBytes <= maxBytes) return { result: text, changed: false };

  // Binary search for the right cut point
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (byteLength(text.slice(0, mid)) <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  // Trim to last complete word boundary if possible
  let cut = lo;
  const lastSpace = text.lastIndexOf(' ', cut);
  if (lastSpace > cut * 0.5) cut = lastSpace;

  const truncated = text.slice(0, cut).trimEnd() + '…';
  return { result: truncated, changed: true };
}

/** Shorten subject line to max chars, breaking at word boundary. */
function shortenSubject(
  subject: string,
  maxChars: number,
): { result: string; changed: boolean } {
  if (subject.length <= maxChars) return { result: subject, changed: false };

  // Try to break at a word boundary
  let cut = subject.lastIndexOf(' ', maxChars - 1);
  if (cut <= 0) cut = maxChars - 1;

  const shortened = subject.slice(0, cut).trimEnd() + '…';
  return { result: shortened, changed: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Optimize an email template to fit within size constraints.
 * Non-destructive: returns a new object, does not modify input.
 */
export function optimize(
  input: EmailTemplateInput,
  limits: TemplateSizeConstraints,
): OptimizationResult {
  const changes: string[] = [];
  const optimized: EmailTemplateInput = {
    subject: input.subject,
    html: input.html,
    text: input.text,
    language: input.language,
  };

  // 1. Minify HTML if over byte limit
  if (byteLength(optimized.html) > limits.maxHtmlBytes) {
    const { result, changes: htmlChanges } = minifyHtml(optimized.html);
    optimized.html = result;
    changes.push(...htmlChanges);

    // Still over? Hard truncate
    if (byteLength(optimized.html) > limits.maxHtmlBytes) {
      const truncated = truncateHtmlBody(optimized.html, limits.maxHtmlBytes);
      optimized.html = truncated.result;
      if (truncated.changed) changes.push('Hard-truncated HTML body to fit byte limit');
    }
  }

  // 2. Truncate text body if over byte limit
  if (optimized.text && byteLength(optimized.text) > limits.maxTextBytes) {
    const { result, changed } = truncateText(optimized.text, limits.maxTextBytes);
    optimized.text = result;
    if (changed) changes.push(`Truncated text body to ${limits.maxTextBytes} bytes`);
  }

  // 3. Shorten subject if over char limit
  if (optimized.subject.length > limits.maxSubjectChars) {
    const { result, changed } = shortenSubject(optimized.subject, limits.maxSubjectChars);
    optimized.subject = result;
    if (changed) changes.push(`Shortened subject to ${limits.maxSubjectChars} chars`);
  }

  return { optimized, changes };
}

/**
 * Hard-truncate HTML body to fit byte limit.
 * Tries to break at a tag boundary to keep HTML somewhat valid.
 */
function truncateHtmlBody(
  html: string,
  maxBytes: number,
): { result: string; changed: boolean } {
  if (byteLength(html) <= maxBytes) return { result: html, changed: false };

  // Binary search for the string index yielding the target byte count
  let lo = 0;
  let hi = html.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (byteLength(html.slice(0, mid)) <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  let cut = lo;
  // Try to break before a tag start
  const tagSearch = html.lastIndexOf('<', cut);
  if (tagSearch > cut * 0.8) cut = tagSearch;

  // Ensure we have closing tags for open ones (best-effort)
  const truncated = html.slice(0, cut);
  const openTags: string[] = [];
  const tagRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(truncated)) !== null) {
    if (m[0].startsWith('</')) {
      const top = openTags[openTags.length - 1];
      if (top === m[1]) openTags.pop();
    } else if (!m[0].endsWith('/>')) {
      openTags.push(m[1]);
    }
  }

  // Close remaining open tags
  const closers = openTags.reverse().map((t) => `</${t}>`).join('');
  const result = truncated + closers;

  return { result, changed: true };
}

export default { optimize };