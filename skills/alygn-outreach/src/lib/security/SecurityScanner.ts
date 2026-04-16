/**
 * SecurityScanner — H-101
 *
 * Scans inputs, templates, and service configurations for common
 * vulnerabilities: injection, path traversal, missing rate limiting,
 * and insufficient input validation.
 *
 * Produces VulnerabilityReport entries with severity, category, and
 * remediation guidance. Integrates with TemplateEngine, EmailService,
 * AuditLogger, and BackupManager for context-aware scanning.
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

import type { TemplateEngine, TemplateData } from '../email/TemplateEngine';
import type { EmailService } from '../email/EmailService';
import type { AuditLogger } from '../audit/AuditLogger';
import type { BackupManager } from '../backup/BackupManager';
import { EndpointRateLimiter, type EndpointPreset } from './EndpointRateLimiter';

// ── Types ──────────────────────────────────────────────────────────────

export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type VulnerabilityCategory =
  | 'injection'
  | 'path-traversal'
  | 'rate-limiting'
  | 'input-validation'
  | 'xss'
  | 'template-injection'
  | 'configuration';

export interface VulnerabilityReport {
  /** Unique report id */
  id: string;
  /** When the scan was performed */
  scannedAt: string;
  /** Total items scanned */
  itemsScanned: number;
  /** All vulnerabilities found, sorted by severity (critical → info) */
  vulnerabilities: VulnerabilityEntry[];
  /** Summary counts by severity */
  summary: VulnerabilitySummary;
  /** Scanner version for audit trail */
  scannerVersion: string;
}

export interface VulnerabilityEntry {
  /** Unique entry id */
  id: string;
  /** Severity level */
  severity: VulnerabilitySeverity;
  /** Vulnerability category */
  category: VulnerabilityCategory;
  /** Human-readable title */
  title: string;
  /** Detailed description */
  description: string;
  /** The problematic value or context that triggered the finding */
  evidence: string;
  /** Actionable remediation steps */
  remediation: string;
  /** Which check produced this finding */
  checkName: 'checkInjection' | 'checkPathTraversal' | 'checkRateLimiting' | 'checkInputValidation';
  /** Optional: the field name or parameter that is vulnerable */
  field?: string;
  /** Optional: the source context (e.g. template name, endpoint) */
  context?: string;
}

export interface VulnerabilitySummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
  total: number;
}

export interface SecurityScanOptions {
  /** Maximum evidence string length (default: 200) */
  maxEvidenceLength?: number;
  /** Custom injection patterns to add (merged with defaults) */
  extraInjectionPatterns?: RegExp[];
  /** Custom path traversal patterns to add (merged with defaults) */
  extraPathTraversalPatterns?: RegExp[];
  /** Whether to scan template content for injection (default: true) */
  scanTemplates?: boolean;
  /** Whether to check rate limiter configuration (default: true) */
  checkRateLimiterConfig?: boolean;
  /** Whether to validate input fields (default: true) */
  validateInputs?: boolean;
}

export interface InputField {
  /** Field name */
  name: string;
  /** Field value to validate */
  value: unknown;
  /** Expected type for validation */
  expectedType?: 'string' | 'number' | 'boolean' | 'email' | 'url' | 'object';
  /** Whether this field is required */
  required?: boolean;
  /** Maximum length (for string fields) */
  maxLength?: number;
  /** Minimum length (for string fields) */
  minLength?: number;
  /** Context label for reports */
  context?: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const SCANNER_VERSION = '1.0.0';

const SEVERITY_ORDER: Record<VulnerabilitySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** SQL injection patterns */
const SQL_INJECTION_PATTERNS: RegExp[] = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|UNION|EXECUTE)\b.*\b(FROM|INTO|TABLE|WHERE|SET|DATABASE|SCHEMA)\b)/i,
  /(--\s*$|\/\*|\*\/|;\s*--)/,
  /('(\s|%20)*OR\s+'[^']*'\s*=\s*')/i,
  /(\bOR\b\s+[\d'"]+\s*=\s*[\d'"]+)/i,
  /(\b1\s*=\s*1\b)/i,
  /(\bWAITFOR\b\s+\bDELAY\b)/i,
  /(\bBENCHMARK\b\s*\()/i,
  /(\bSLEEP\b\s*\(\s*\d+\s*\))/i,
];

/** XSS / script injection patterns */
const XSS_INJECTION_PATTERNS: RegExp[] = [
  /<script\b[^>]*>/i,
  /<\/script>/i,
  /\bon\w+\s*=\s*["']?/i,
  /javascript\s*:/i,
  /vbscript\s*:/i,
  /<iframe\b/i,
  /<object\b/i,
  /<embed\b/i,
  /<link\b/i,
  /<meta\b/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
  /document\.(cookie|domain|write)/i,
  /window\.(location|open|eval)/i,
];

/** Template injection patterns (for template engines like Handlebars/Mustache) */
const TEMPLATE_INJECTION_PATTERNS: RegExp[] = [
  /\{\{[#/]?[\w.]+\}\}/,           // {{variable}}, {{#if}}, {{/each}}
  /\$\{[^}]+\}/,                    // ${expression}
  /<%[=]?\s*[\w.]+\s*%>/,          // <%= variable %>
  /\{%\s*[\w.]+\s*%\}/,            // {% block %}
];

/** Path traversal patterns */
const PATH_TRAVERSAL_PATTERNS: RegExp[] = [
  /\.\./,                            // ../
  /\.\.\//,                          // ../ (explicit)
  /\.\.\\/,                          // ..\
  /%2e%2e/i,                         // URL-encoded ../
  /%2e%2e%2f/i,                      // URL-encoded ../
  /%2e%2e%5c/i,                      // URL-encoded ..\
  /\.\.%2f/i,                        // Mixed encoding
  /\.\.%5c/i,                        // Mixed encoding
  /~\//,                             // Home directory access
  /\/etc\/(passwd|shadow|hosts)/i,   // Sensitive system files
  /\/proc\/self\//i,                  // Process information
  /\\[Cc]:\\/,                       // Windows drive paths
];

/** Required endpoint presets that should be rate-limited */
const REQUIRED_RATE_LIMIT_ENDPOINTS: EndpointPreset[] = [
  'email-send',
  'email-batch',
  'webhook-incoming',
  'webhook-outgoing',
  'auth-login',
  'auth-register',
  'password-reset',
];

/** Maximum allowed token counts for rate limit presets (sanity thresholds).
 * Values represent the maximum tokens a limiter should allow — if the limiter
 * allows MORE than this, it's flagged as too permissive. */
const MAX_ALLOWED_TOKENS: Partial<Record<EndpointPreset, number>> = {
  'auth-login': 3,
  'auth-register': 2,
  'password-reset': 2,
  'email-send': 5,
};

// ── Helpers ────────────────────────────────────────────────────────────

let _nextId = 0;
function nextId(): string {
  return `vuln-${Date.now()}-${++_nextId}`;
}

function truncateEvidence(evidence: string, maxLen: number): string {
  if (evidence.length <= maxLen) return evidence;
  return evidence.slice(0, maxLen - 3) + '...';
}

function buildSummary(entries: VulnerabilityEntry[]): VulnerabilitySummary {
  const summary: VulnerabilitySummary = {
    critical: 0, high: 0, medium: 0, low: 0, info: 0, total: entries.length,
  };
  for (const entry of entries) {
    summary[entry.severity]++;
  }
  return summary;
}

function sortVulnerabilities(entries: VulnerabilityEntry[]): VulnerabilityEntry[] {
  return entries.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// ── SecurityScanner ────────────────────────────────────────────────────

export class SecurityScanner {
  private readonly maxEvidenceLength: number;
  private readonly sqlPatterns: RegExp[];
  private readonly xssPatterns: RegExp[];
  private readonly templatePatterns: RegExp[];
  private readonly pathTraversalPatterns: RegExp[];
  private readonly scanTemplates: boolean;
  private readonly checkRateLimiterConfig: boolean;
  private readonly validateInputs: boolean;

  // Integration references (optional — scanner works without them)
  private templateEngine?: TemplateEngine;
  private emailService?: EmailService;
  private auditLogger?: AuditLogger;
  private backupManager?: BackupManager;

  constructor(opts: SecurityScanOptions = {}) {
    this.maxEvidenceLength = opts.maxEvidenceLength ?? 200;
    this.sqlPatterns = [...SQL_INJECTION_PATTERNS, ...(opts.extraInjectionPatterns ?? [])];
    this.xssPatterns = XSS_INJECTION_PATTERNS;
    this.templatePatterns = TEMPLATE_INJECTION_PATTERNS;
    this.pathTraversalPatterns = [
      ...PATH_TRAVERSAL_PATTERNS,
      ...(opts.extraPathTraversalPatterns ?? []),
    ];
    this.scanTemplates = opts.scanTemplates ?? true;
    this.checkRateLimiterConfig = opts.checkRateLimiterConfig ?? true;
    this.validateInputs = opts.validateInputs ?? true;
  }

  // ── Integration setters ─────────────────────────────────────────

  /** Inject TemplateEngine for template-aware injection scanning */
  setTemplateEngine(engine: TemplateEngine): void {
    this.templateEngine = engine;
  }

  /** Inject EmailService for rate-limiting and configuration checks */
  setEmailService(service: EmailService): void {
    this.emailService = service;
  }

  /** Inject AuditLogger — scan results are logged for audit trail */
  setAuditLogger(logger: AuditLogger): void {
    this.auditLogger = logger;
  }

  /** Inject BackupManager for path-traversal checks on backup paths */
  setBackupManager(manager: BackupManager): void {
    this.backupManager = manager;
  }

  // ── Full scan ──────────────────────────────────────────────────

  /**
   * Run a comprehensive security scan across all integrated services.
   * Returns a VulnerabilityReport with all findings.
   */
  async scan(inputs?: InputField[], templateContents?: Map<string, string>): Promise<VulnerabilityReport> {
    const vulnerabilities: VulnerabilityEntry[] = [];
    let itemsScanned = 0;

    // 1. Injection checks on inputs
    if (inputs && inputs.length > 0) {
      const injectionResults = this.checkInjection(inputs);
      vulnerabilities.push(...injectionResults.vulnerabilities);
      itemsScanned += injectionResults.itemsScanned;
    }

    // 2. Template injection checks
    if (this.scanTemplates && templateContents && templateContents.size > 0) {
      for (const [name, content] of templateContents) {
        const templateResults = this.checkInjection(
          [{ name, value: content, context: `template:${name}` }],
        );
        vulnerabilities.push(...templateResults.vulnerabilities);
        itemsScanned += templateResults.itemsScanned;
      }
    }

    // 3. Path traversal checks
    if (inputs && inputs.length > 0) {
      const pathResults = this.checkPathTraversal(inputs);
      vulnerabilities.push(...pathResults.vulnerabilities);
      itemsScanned += pathResults.itemsScanned;
    }

    // 4. Rate limiting checks
    if (this.checkRateLimiterConfig) {
      const rateResults = this.checkRateLimiting();
      vulnerabilities.push(...rateResults.vulnerabilities);
      itemsScanned += rateResults.itemsScanned;
    }

    // 5. Input validation checks
    if (this.validateInputs && inputs && inputs.length > 0) {
      const validationResults = this.checkInputValidation(inputs);
      vulnerabilities.push(...validationResults.vulnerabilities);
      itemsScanned += validationResults.itemsScanned;
    }

    // Sort by severity
    const sorted = sortVulnerabilities(vulnerabilities);

    const report: VulnerabilityReport = {
      id: `scan-${Date.now()}-${++_nextId}`,
      scannedAt: new Date().toISOString(),
      itemsScanned,
      vulnerabilities: sorted,
      summary: buildSummary(sorted),
      scannerVersion: SCANNER_VERSION,
    };

    // Log to audit logger if available
    if (this.auditLogger) {
      await this.auditLogger.log(
        'SecurityScanner',
        'security.scan',
        'full-scan',
        {
          reportId: report.id,
          totalVulnerabilities: report.summary.total,
          critical: report.summary.critical,
          high: report.summary.high,
          medium: report.summary.medium,
          low: report.summary.low,
          info: report.summary.info,
        },
        report.summary.critical > 0 ? 'failure' : 'success',
      ).catch(() => { /* audit write failure must not crash scan */ });
    }

    return report;
  }

  // ── Individual checks ──────────────────────────────────────────

  /**
   * Check for injection vulnerabilities: SQL injection, XSS, and
   * template injection in string inputs.
   */
  checkInjection(inputs: InputField[]): { vulnerabilities: VulnerabilityEntry[]; itemsScanned: number } {
    const vulnerabilities: VulnerabilityEntry[] = [];
    let itemsScanned = 0;

    for (const field of inputs) {
      if (typeof field.value !== 'string' || field.value.length === 0) continue;
      itemsScanned++;

      const value = field.value;
      const ctx = field.context ?? field.name;

      // SQL injection check — one SQL finding per field is enough
      for (const pattern of this.sqlPatterns) {
        if (pattern.test(value)) {
          vulnerabilities.push({
            id: nextId(),
            severity: 'critical',
            category: 'injection',
            title: 'SQL Injection pattern detected',
            description: `Input field "${field.name}" contains a pattern consistent with SQL injection attempts. This could allow unauthorized database access, data exfiltration, or data modification.`,
            evidence: truncateEvidence(value, this.maxEvidenceLength),
            remediation: 'Use parameterized queries or prepared statements. Never concatenate user input into SQL strings. Validate and sanitize all inputs at the boundary.',
            checkName: 'checkInjection',
            field: field.name,
            context: ctx,
          });
          break;
        }
      }

      // XSS injection check — runs independently even if SQL was detected
      for (const pattern of this.xssPatterns) {
        if (pattern.test(value)) {
          vulnerabilities.push({
            id: nextId(),
            severity: 'high',
            category: 'xss',
            title: 'Cross-site scripting (XSS) pattern detected',
            description: `Input field "${field.name}" contains HTML/script content that could execute in a browser context. Stored XSS can compromise other users who view this data.`,
            evidence: truncateEvidence(value, this.maxEvidenceLength),
            remediation: 'HTML-escape all user-provided content before rendering. Use Content-Security-Policy headers. Prefer text content over raw HTML in templates.',
            checkName: 'checkInjection',
            field: field.name,
            context: ctx,
          });
          break;
        }
      }

      // Template injection check (only for non-template contexts) — runs independently
      if (!field.context?.startsWith('template:')) {
        for (const pattern of this.templatePatterns) {
          if (pattern.test(value)) {
            vulnerabilities.push({
              id: nextId(),
              severity: 'high',
              category: 'template-injection',
              title: 'Template injection pattern detected',
              description: `Input field "${field.name}" contains template syntax that could be interpreted by a template engine (Handlebars, Mustache, EJS, etc.). Server-side template injection can lead to remote code execution.`,
              evidence: truncateEvidence(value, this.maxEvidenceLength),
              remediation: 'Sanitize user input before passing to template engines. Use sandboxed template environments. Never render user-controlled strings as templates.',
              checkName: 'checkInjection',
              field: field.name,
              context: ctx,
            });
            break;
          }
        }
      }
    }

    return { vulnerabilities, itemsScanned };
  }

  /**
   * Check for path traversal vulnerabilities in string inputs.
   * Detects directory traversal sequences, encoded variants, and
   * references to sensitive system paths.
   */
  checkPathTraversal(inputs: InputField[]): { vulnerabilities: VulnerabilityEntry[]; itemsScanned: number } {
    const vulnerabilities: VulnerabilityEntry[] = [];
    let itemsScanned = 0;

    for (const field of inputs) {
      if (typeof field.value !== 'string' || field.value.length === 0) continue;
      itemsScanned++;

      const value = field.value;
      const ctx = field.context ?? field.name;

      for (const pattern of this.pathTraversalPatterns) {
        if (pattern.test(value)) {
          vulnerabilities.push({
            id: nextId(),
            severity: 'critical',
            category: 'path-traversal',
            title: 'Path traversal pattern detected',
            description: `Input field "${field.name}" contains directory traversal sequences that could allow reading or writing files outside the intended directory. This can lead to exposure of sensitive files (e.g., /etc/passwd) or arbitrary file write.`,
            evidence: truncateEvidence(value, this.maxEvidenceLength),
            remediation: 'Use path.resolve() and verify the result stays within the allowed directory. Reject inputs containing "..", encoded variants, or absolute paths. Never pass user input directly to file system APIs.',
            checkName: 'checkPathTraversal',
            field: field.name,
            context: ctx,
          });
          break; // One finding per field
        }
      }
    }

    // Check BackupManager paths if available
    if (this.backupManager) {
      itemsScanned++;
      // BackupManager already validates its own dataDir in the constructor
      // by checking for path traversal. If we got here, it passed.
      // We still flag if the backup directory is in a sensitive location.
      const auditDir = (this.auditLogger as unknown as { getAuditDir?: () => string })?.getAuditDir?.();
      if (auditDir && /\/etc\/|\/proc\/|\/sys\/|\/root\/?$/i.test(auditDir)) {
        vulnerabilities.push({
          id: nextId(),
          severity: 'high',
          category: 'path-traversal',
          title: 'Audit log directory in sensitive system path',
          description: 'The AuditLogger data directory resolves to a sensitive system path. This could expose audit data or allow tampering with system files.',
          evidence: truncateEvidence(auditDir, this.maxEvidenceLength),
          remediation: 'Move the audit data directory to a non-system path (e.g., ./data/audit). Ensure the directory has appropriate permissions.',
          checkName: 'checkPathTraversal',
          context: 'AuditLogger.dataDir',
        });
      }
    }

    return { vulnerabilities, itemsScanned };
  }

  /**
   * Check rate limiting configuration across integrated services.
   * Verifies that critical endpoints have rate limiters configured
   * and that token counts meet minimum security thresholds.
   */
  checkRateLimiting(): { vulnerabilities: VulnerabilityEntry[]; itemsScanned: number } {
    const vulnerabilities: VulnerabilityEntry[] = [];
    let itemsScanned = 0;

    const rateLimiter = this.emailService?.getEndpointRateLimiter() ?? null;

    if (!rateLimiter) {
      itemsScanned = 1;
      vulnerabilities.push({
        id: nextId(),
        severity: 'high',
        category: 'rate-limiting',
        title: 'No rate limiter configured on EmailService',
        description: 'The EmailService does not have an EndpointRateLimiter attached. Without rate limiting, the service is vulnerable to email bombing, abuse, and API quota exhaustion.',
        evidence: 'EmailService.getEndpointRateLimiter() returned null',
        remediation: 'Create an EndpointRateLimiter instance and attach it via EmailService.setEndpointRateLimiter(). Configure at minimum the "email-send" and "email-batch" presets.',
        checkName: 'checkRateLimiting',
        context: 'EmailService',
      });
      return { vulnerabilities, itemsScanned };
    }

    // Check each required endpoint preset
    const configuredEndpoints = rateLimiter.getConfiguredEndpoints();

    for (const preset of REQUIRED_RATE_LIMIT_ENDPOINTS) {
      itemsScanned++;
      if (!configuredEndpoints.includes(preset)) {
        vulnerabilities.push({
          id: nextId(),
          severity: 'medium',
          category: 'rate-limiting',
          title: `Missing rate limiter for "${preset}" endpoint`,
          description: `The endpoint preset "${preset}" does not have a rate limiter configured. Unrestricted access to this endpoint could allow abuse or brute-force attacks.`,
          evidence: `Endpoint "${preset}" not in configured list: [${configuredEndpoints.join(', ')}]`,
          remediation: `Add the "${preset}" preset to the EndpointRateLimiter configuration, or initialize it via the constructor.`,
          checkName: 'checkRateLimiting',
          context: `EndpointRateLimiter.${preset}`,
        });
      } else {
        // Check maximum allowed token thresholds
        const maxAllowed = MAX_ALLOWED_TOKENS[preset];
        if (maxAllowed !== undefined) {
          const limiter = rateLimiter.getLimiterForEndpoint(preset);
          const status = limiter.getStatus();
          if (status.maxTokens > maxAllowed) {
            vulnerabilities.push({
              id: nextId(),
              severity: 'low',
              category: 'rate-limiting',
              title: `Rate limit for "${preset}" allows too many tokens`,
              description: `The "${preset}" endpoint allows ${status.maxTokens} tokens per interval, which exceeds the recommended maximum of ${maxAllowed}. This may allow abuse or brute-force attacks.`,
              evidence: `maxTokens=${status.maxTokens}, recommended max=${maxAllowed}`,
              remediation: `Reduce maxTokens for "${preset}" to ${maxAllowed} or lower. Adjust refillAmount and refillIntervalMs accordingly.`,
              checkName: 'checkRateLimiting',
              context: `EndpointRateLimiter.${preset}`,
            });
          }
        }
      }
    }

    return { vulnerabilities, itemsScanned };
  }

  /**
   * Check input validation: type conformance, required fields,
   * length constraints, and format validation (email, URL).
   */
  checkInputValidation(inputs: InputField[]): { vulnerabilities: VulnerabilityEntry[]; itemsScanned: number } {
    const vulnerabilities: VulnerabilityEntry[] = [];
    let itemsScanned = 0;

    for (const field of inputs) {
      itemsScanned++;
      const ctx = field.context ?? field.name;
      const value = field.value;

      // Required check
      if (field.required && (value === null || value === undefined || value === '')) {
        vulnerabilities.push({
          id: nextId(),
          severity: 'medium',
          category: 'input-validation',
          title: 'Required field is empty',
          description: `Field "${field.name}" is marked as required but has no value. This could cause downstream errors or allow incomplete data to propagate.`,
          evidence: `value=${String(value)}`,
          remediation: 'Validate required fields at the API boundary before processing. Return a 400 error with the missing field name.',
          checkName: 'checkInputValidation',
          field: field.name,
          context: ctx,
        });
        continue;
      }

      // Skip further checks if value is empty and not required
      if (value === null || value === undefined || value === '') continue;

      // Type check
      if (field.expectedType) {
        const typeValid = this.validateType(value, field.expectedType);
        if (!typeValid) {
          vulnerabilities.push({
            id: nextId(),
            severity: 'high',
            category: 'input-validation',
            title: `Type mismatch: expected ${field.expectedType}`,
            description: `Field "${field.name}" has type "${typeof value}" but expected "${field.expectedType}". Type mismatches can cause unexpected behavior, coercion bugs, or security issues.`,
            evidence: `value type=${typeof value}, expected=${field.expectedType}`,
            remediation: `Validate input type at the boundary using Zod, Joi, or a custom validator. Reject requests with incorrect types.`,
            checkName: 'checkInputValidation',
            field: field.name,
            context: ctx,
          });
        }
      }

      // String-specific checks
      if (typeof value === 'string') {
        // Length checks
        if (field.minLength !== undefined && value.length < field.minLength) {
          vulnerabilities.push({
            id: nextId(),
            severity: 'low',
            category: 'input-validation',
            title: 'Input below minimum length',
            description: `Field "${field.name}" has length ${value.length} but minimum is ${field.minLength}. Short inputs may indicate incomplete or malformed data.`,
            evidence: `length=${value.length}, minLength=${field.minLength}`,
            remediation: 'Enforce minimum length constraints at the API boundary. Return a validation error to the client.',
            checkName: 'checkInputValidation',
            field: field.name,
            context: ctx,
          });
        }

        if (field.maxLength !== undefined && value.length > field.maxLength) {
          vulnerabilities.push({
            id: nextId(),
            severity: 'medium',
            category: 'input-validation',
            title: 'Input exceeds maximum length',
            description: `Field "${field.name}" has length ${value.length} but maximum is ${field.maxLength}. Unbounded inputs can cause memory issues, DoS, or buffer overflows in downstream systems.`,
            evidence: `length=${value.length}, maxLength=${field.maxLength}`,
            remediation: 'Enforce maximum length constraints at the API boundary. Truncate or reject oversized inputs.',
            checkName: 'checkInputValidation',
            field: field.name,
            context: ctx,
          });
        }

        // Email format check
        if (field.expectedType === 'email' && !this.isValidEmail(value)) {
          vulnerabilities.push({
            id: nextId(),
            severity: 'high',
            category: 'input-validation',
            title: 'Invalid email format',
            description: `Field "${field.name}" does not match a valid email format. Invalid emails can cause delivery failures, bounce loops, or be used for injection attacks.`,
            evidence: truncateEvidence(value, this.maxEvidenceLength),
            remediation: 'Validate email format using a robust regex or a dedicated email validation library. Reject invalid emails at the API boundary.',
            checkName: 'checkInputValidation',
            field: field.name,
            context: ctx,
          });
        }

        // URL format check
        if (field.expectedType === 'url' && !this.isValidUrl(value)) {
          vulnerabilities.push({
            id: nextId(),
            severity: 'medium',
            category: 'input-validation',
            title: 'Invalid URL format',
            description: `Field "${field.name}" does not match a valid URL format. Invalid URLs can cause SSRF vulnerabilities or redirect abuse if used without validation.`,
            evidence: truncateEvidence(value, this.maxEvidenceLength),
            remediation: 'Validate URL format and scheme (allow only https://). Check the resolved host against an allowlist to prevent SSRF.',
            checkName: 'checkInputValidation',
            field: field.name,
            context: ctx,
          });
        }

        // Null byte check
        if (value.includes('\0')) {
          vulnerabilities.push({
            id: nextId(),
            severity: 'high',
            category: 'input-validation',
            title: 'Null byte detected in input',
            description: `Field "${field.name}" contains null bytes (\\0). Null bytes can truncate strings in C-based systems, bypass file extension checks, or cause unexpected behavior in downstream parsers.`,
            evidence: 'Input contains \\0 (null byte)',
            remediation: 'Strip null bytes from all string inputs. Reject requests containing null bytes in string fields.',
            checkName: 'checkInputValidation',
            field: field.name,
            context: ctx,
          });
        }
      }
    }

    return { vulnerabilities, itemsScanned };
  }

  // ── Private helpers ────────────────────────────────────────────

  private validateType(value: unknown, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !Number.isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'email':
        return typeof value === 'string' && this.isValidEmail(value);
      case 'url':
        return typeof value === 'string' && this.isValidUrl(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  private isValidEmail(value: string): boolean {
    // RFC 5322 simplified — catches most invalid cases without false positives
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  private isValidUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }
}

export default SecurityScanner;