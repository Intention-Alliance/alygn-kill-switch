/**
 * TemplateValidator — F-072 + F-073
 * Validates email templates before sending: HTML structure, required fields,
 * unresolved personalization tokens, language consistency, and size constraints.
 *
 * All operations are synchronous pure functions (< 10ms per template).
 * Reuses lang-guard patterns for language validation.
 */

import { containsEnglishPainPoint } from '../../../entities/lang-guard';
import { getLimits } from './ProviderSizeLimits';
import { optimize } from './TemplateOptimizer';
import { byteLength } from './utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateSizeConstraints {
  /** Max HTML body size in bytes (default: 3500 for strict providers) */
  maxHtmlBytes: number;
  /** Max subject line length in characters (default: 78 per RFC 2822) */
  maxSubjectChars: number;
  /** Max text body size in bytes (default: 1500) */
  maxTextBytes: number;
}

export const DEFAULT_SIZE_CONSTRAINTS: TemplateSizeConstraints = {
  maxHtmlBytes: 3500,
  maxSubjectChars: 78,
  maxTextBytes: 1500,
};

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  rule: string;
  message: string;
  detail?: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidateAndOptimizeResult {
  result: TemplateValidationResult;
  /** The (possibly optimized) template */
  optimized: EmailTemplateInput;
  /** Changes applied during optimization */
  changes: string[];
}

export interface EmailTemplateInput {
  subject: string;
  html: string;
  text?: string;
  /** Expected language: 'es' for municipal, 'en' for VC */
  language?: 'es' | 'en';
}

// ---------------------------------------------------------------------------
// Validation rules — pure functions
// ---------------------------------------------------------------------------

/** Check that HTML has basic well-formed structure (opening/closing tags). */
function validateHtmlStructure(html: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Must start with DOCTYPE or <html
  const trimmed = html.trim();
  if (!/^<!DOCTYPE\s+html/i.test(trimmed) && !/^<html/i.test(trimmed)) {
    issues.push({
      severity: 'error',
      rule: 'html-structure',
      message: 'HTML must start with <!DOCTYPE html> or <html>',
    });
  }

  // Check paired tags that matter for email rendering
  const pairedTags = ['html', 'head', 'body', 'div', 'table', 'tr', 'td', 'a', 'p', 'ul', 'li'];
  for (const tag of pairedTags) {
    const openRe = new RegExp(`<${tag}[\\s>]`, 'gi');
    const closeRe = new RegExp(`</${tag}>`, 'gi');
    const opens = (trimmed.match(openRe) || []).length;
    const closes = (trimmed.match(closeRe) || []).length;
    // Allow self-closing or attribute-only tags to be slightly off, but flag big mismatches
    if (opens > closes + 2) {
      issues.push({
        severity: 'warning',
        rule: 'html-structure',
        message: `Possible unclosed <${tag}> tags: ${opens} opens vs ${closes} closes`,
      });
    }
  }

  // Check charset meta
  if (!/charset\s*=\s*["']?UTF-8/i.test(trimmed)) {
    issues.push({
      severity: 'warning',
      rule: 'html-structure',
      message: 'Missing charset=UTF-8 declaration; some email clients may render incorrectly',
    });
  }

  return issues;
}

/** Check that required fields (subject, html, text) are present and non-empty. */
function validateRequiredFields(input: EmailTemplateInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!input.subject || input.subject.trim().length === 0) {
    issues.push({ severity: 'error', rule: 'required-fields', message: 'Subject is missing or empty' });
  }

  if (!input.html || input.html.trim().length === 0) {
    issues.push({ severity: 'error', rule: 'required-fields', message: 'HTML body is missing or empty' });
  }

  if (!input.text || input.text.trim().length === 0) {
    issues.push({ severity: 'warning', rule: 'required-fields', message: 'Text body is missing; some clients require plain-text fallback' });
  }

  return issues;
}

/** Check for unresolved personalization tokens like {{name}} or {{company}}. */
function validateTokensResolved(html: string, subject: string, text?: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const tokenPattern = /\{\{([^}]+)\}\}/g;

  const fields = [
    { name: 'subject', value: subject },
    { name: 'html', value: html },
    ...(text ? [{ name: 'text', value: text }] : []),
  ];

  for (const field of fields) {
    let match: RegExpExecArray | null;
    const re = new RegExp(tokenPattern.source, tokenPattern.flags);
    while ((match = re.exec(field.value)) !== null) {
      issues.push({
        severity: 'error',
        rule: 'unresolved-tokens',
        message: `Unresolved personalization token {{${match[1].trim()}}} found in ${field.name}`,
        detail: match[0],
      });
    }
  }

  return issues;
}

/**
 * Validate language consistency.
 * - For 'es' (municipal): flag English pain-point patterns from lang-guard
 * - For 'en' (VC): flag if Spanish markers appear (basic heuristic)
 */
function validateLanguageConsistency(input: EmailTemplateInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const lang = input.language;

  if (lang === 'es') {
    // Use lang-guard to detect English pain points in subject, html, text
    const fields = [
      { name: 'subject', value: input.subject },
      { name: 'html', value: input.html },
      ...(input.text ? [{ name: 'text', value: input.text }] : []),
    ];

    for (const field of fields) {
      if (containsEnglishPainPoint(field.value)) {
        issues.push({
          severity: 'error',
          rule: 'language-consistency',
          message: `English content detected in ${field.name} for Spanish (municipal) template`,
          detail: field.value.substring(0, 120),
        });
      }
    }

    // Also check html lang attribute
    if (!/lang\s*=\s*["']es["']/i.test(input.html)) {
      issues.push({
        severity: 'warning',
        rule: 'language-consistency',
        message: 'HTML lang attribute is not set to "es" for Spanish template',
      });
    }
  }

  if (lang === 'en') {
    // Check html lang attribute
    if (!/lang\s*=\s*["']en["']/i.test(input.html)) {
      issues.push({
        severity: 'warning',
        rule: 'language-consistency',
        message: 'HTML lang attribute is not set to "en" for English template',
      });
    }

    // Basic Spanish-in-English heuristic: common Spanish-only words
    const spanishMarkers = /\b(usted|nosotros|gobernanza|rendición|municipalidad|edil|coordinación)\b/i;
    const fields = [
      { name: 'subject', value: input.subject },
      { name: 'html', value: input.html },
      ...(input.text ? [{ name: 'text', value: input.text }] : []),
    ];

    for (const field of fields) {
      if (spanishMarkers.test(field.value)) {
        issues.push({
          severity: 'warning',
          rule: 'language-consistency',
          message: `Spanish content detected in ${field.name} for English (VC) template`,
          detail: field.value.substring(0, 120),
        });
      }
    }
  }

  return issues;
}

/** Validate size constraints (bytes for HTML/text, chars for subject). */
function validateSizeConstraints(
  input: EmailTemplateInput,
  constraints: TemplateSizeConstraints,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Subject length (characters, RFC 2822)
  const subjectLen = input.subject.length;
  if (subjectLen > constraints.maxSubjectChars) {
    issues.push({
      severity: 'error',
      rule: 'size-constraints',
      message: `Subject exceeds ${constraints.maxSubjectChars} characters (${subjectLen})`,
    });
  }

  // HTML body size (bytes — using TextEncoder for accurate byte count)
  const htmlBytes = byteLength(input.html);
  if (htmlBytes > constraints.maxHtmlBytes) {
    issues.push({
      severity: 'error',
      rule: 'size-constraints',
      message: `HTML body exceeds ${constraints.maxHtmlBytes} bytes (${htmlBytes})`,
    });
  }

  // Text body size
  if (input.text) {
    const textBytes = byteLength(input.text);
    if (textBytes > constraints.maxTextBytes) {
      issues.push({
        severity: 'error',
        rule: 'size-constraints',
        message: `Text body exceeds ${constraints.maxTextBytes} bytes (${textBytes})`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// byteLength moved to utils.ts (F-073)

// ---------------------------------------------------------------------------
// TemplateValidator class
// ---------------------------------------------------------------------------

export class TemplateValidator {
  private constraints: TemplateSizeConstraints;

  constructor(constraints?: Partial<TemplateSizeConstraints>) {
    this.constraints = { ...DEFAULT_SIZE_CONSTRAINTS, ...constraints };
  }

  /**
   * Validate an email template. Returns a result with errors and warnings.
   * Any error-level issue means the template is invalid and should not be sent.
   */
  validate(input: EmailTemplateInput): TemplateValidationResult {
    const allIssues: ValidationIssue[] = [
      ...validateRequiredFields(input),
      ...validateHtmlStructure(input.html),
      ...validateTokensResolved(input.html, input.subject, input.text),
      ...validateLanguageConsistency(input),
      ...validateSizeConstraints(input, this.constraints),
    ];

    const errors = allIssues.filter((i) => i.severity === 'error');
    const warnings = allIssues.filter((i) => i.severity === 'warning');

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /** Update size constraints (e.g., for different providers). */
  setConstraints(constraints: Partial<TemplateSizeConstraints>): void {
    this.constraints = { ...this.constraints, ...constraints };
  }

  /** Get current constraints. */
  getConstraints(): TemplateSizeConstraints {
    return { ...this.constraints };
  }

  /**
   * Validate and auto-optimize a template.
   * If the template exceeds size limits, it is optimized and re-validated.
   * Returns the final validation result, the (possibly optimized) template,
   * and a list of changes made during optimization.
   */
  validateAndOptimize(
    input: EmailTemplateInput,
    providerName?: string,
  ): ValidateAndOptimizeResult {
    // Use provider-specific limits if a provider name is given
    const limits = providerName ? getLimits(providerName) : this.constraints;

    // Build a validator that uses the provider limits for size checks
    const providerValidator = new TemplateValidator(limits);

    // First pass: validate against the limits we'll optimize with
    const firstPass = providerValidator.validate(input);

    // Check if any size errors exist
    const sizeErrors = firstPass.errors.filter((e) => e.rule === 'size-constraints');
    if (sizeErrors.length === 0) {
      return { result: firstPass, optimized: input, changes: [] };
    }

    // Optimize against provider limits and re-validate
    const { optimized, changes } = optimize(input, limits);
    const secondPass = providerValidator.validate(optimized);

    return { result: secondPass, optimized, changes };
  }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/** Format a TemplateValidationResult into a readable string for logging. */
export function formatValidationResult(result: TemplateValidationResult): string {
  if (result.valid && result.warnings.length === 0) {
    return '✅ Template valid';
  }

  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push(`❌ ${result.errors.length} error(s):`);
    for (const e of result.errors) {
      lines.push(`  [${e.rule}] ${e.message}${e.detail ? ` — ${e.detail}` : ''}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`⚠️ ${result.warnings.length} warning(s):`);
    for (const w of result.warnings) {
      lines.push(`  [${w.rule}] ${w.message}${w.detail ? ` — ${w.detail}` : ''}`);
    }
  }

  return lines.join('\n');
}

export default TemplateValidator;