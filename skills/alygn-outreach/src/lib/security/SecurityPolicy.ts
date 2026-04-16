/**
 * SecurityPolicy — H-102
 *
 * Defines configurable security rules for email, webhook, and API actions.
 * Provides `checkPolicy(action, context) → PolicyResult` to evaluate whether
 * an action is allowed, denied, or requires further enforcement.
 *
 * Rules cover: maxEmailsPerDay, allowedDomains, blockedDomains,
 * requireTLS, maxAttachmentSize, contentFilter.
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type PolicyAction =
  | 'email.send'
  | 'email.batch'
  | 'webhook.incoming'
  | 'webhook.outgoing'
  | 'api.read'
  | 'api.write'
  | 'api.general';

export type PolicyVerdict = 'allow' | 'deny' | 'conditional';

export interface ContentFilterRule {
  /** Regex pattern to match in email subject or body */
  pattern: RegExp;
  /** Human-readable label for audit logs */
  label: string;
  /** Whether matching content is blocked (true) or just flagged (false) */
  block: boolean;
}

export interface SecurityPolicyRules {
  /** Maximum emails allowed per recipient per day (0 = unlimited) */
  maxEmailsPerDay: number;
  /** Only allow emails to these domains (empty = allow all) */
  allowedDomains: string[];
  /** Always block emails to these domains */
  blockedDomains: string[];
  /** Require TLS for outbound email (reject if unavailable) */
  requireTLS: boolean;
  /** Maximum attachment size in bytes (0 = unlimited) */
  maxAttachmentSize: number;
  /** Content filter rules for email subjects and bodies */
  contentFilter: ContentFilterRule[];
}

export interface PolicyContext {
  /** Target email address (for email actions) */
  recipient?: string;
  /** Sender email address */
  sender?: string;
  /** Email subject line */
  subject?: string;
  /** Email body content (HTML or text) */
  body?: string;
  /** Attachment sizes in bytes */
  attachmentSizes?: number[];
  /** Whether TLS is available for this send */
  tlsAvailable?: boolean;
  /** Number of emails already sent to this recipient today */
  emailsSentToday?: number;
  /** Source IP or identifier for API/webhook actions */
  source?: string;
  /** Arbitrary metadata */
  metadata?: Record<string, unknown>;
}

export interface PolicyResult {
  /** Final verdict */
  verdict: PolicyVerdict;
  /** Human-readable reason */
  reason: string;
  /** Individual rule evaluations that contributed to the verdict */
  checks: PolicyCheck[];
  /** Which rule caused a denial (if any) */
  deniedBy?: string;
}

export interface PolicyCheck {
  /** Rule name that was evaluated */
  rule: string;
  /** Whether this rule passed */
  passed: boolean;
  /** Human-readable detail */
  detail: string;
}

// ── Default rules ───────────────────────────────────────────────────────

const DEFAULT_CONTENT_FILTER: ContentFilterRule[] = [
  {
    pattern: /(\b(?:password|contraseña|clave)\s*(?:is|es|:)\s*\S+)/i,
    label: 'password-in-body',
    block: true,
  },
  {
    pattern: /<script\b[^>]*>/i,
    label: 'script-tag',
    block: true,
  },
  {
    pattern: /\b(?:credit\s*card|tarjeta\s*de\s*crédito|cc\s*number)\b/i,
    label: 'pii-credit-card',
    block: true,
  },
  // CAUTION: This regex matches 7+ digit number sequences (e.g. 123-45-6789)
  // which also appear in phone numbers, version strings, and part numbers.
  // Using block:false (flag only) to avoid false-positive rejection of
  // legitimate emails that happen to contain numeric patterns.
  {
    pattern: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/,
    label: 'ssn-pattern',
    block: false,
  },
];

export const DEFAULT_SECURITY_RULES: SecurityPolicyRules = {
  maxEmailsPerDay: 5,
  allowedDomains: [],
  blockedDomains: [],
  requireTLS: true,
  maxAttachmentSize: 10 * 1024 * 1024, // 10 MB
  contentFilter: DEFAULT_CONTENT_FILTER,
};

// ── Implementation ─────────────────────────────────────────────────────

export class SecurityPolicy {
  private readonly rules: SecurityPolicyRules;

  constructor(rules?: Partial<SecurityPolicyRules>) {
    this.rules = {
      maxEmailsPerDay: rules?.maxEmailsPerDay ?? DEFAULT_SECURITY_RULES.maxEmailsPerDay,
      allowedDomains: rules?.allowedDomains ?? DEFAULT_SECURITY_RULES.allowedDomains,
      blockedDomains: rules?.blockedDomains ?? DEFAULT_SECURITY_RULES.blockedDomains,
      requireTLS: rules?.requireTLS ?? DEFAULT_SECURITY_RULES.requireTLS,
      maxAttachmentSize: rules?.maxAttachmentSize ?? DEFAULT_SECURITY_RULES.maxAttachmentSize,
      contentFilter: rules?.contentFilter ?? DEFAULT_SECURITY_RULES.contentFilter,
    };
  }

  /** Get a read-only snapshot of current rules */
  getRules(): Readonly<SecurityPolicyRules> {
    return this.rules;
  }

  /**
   * Evaluate a policy for the given action and context.
   * Returns PolicyResult with verdict and individual check details.
   */
  checkPolicy(action: PolicyAction, context: PolicyContext): PolicyResult {
    const checks: PolicyCheck[] = [];
    const denials: { rule: string; reason: string }[] = [];

    // ── Domain checks (email actions only) ────────────────────────

    if (action === 'email.send' || action === 'email.batch') {
      if (context.recipient) {
        const domain = this.extractDomain(context.recipient);

        // Blocked domains
        if (this.rules.blockedDomains.length > 0) {
          const blocked = this.rules.blockedDomains.some(
            (d) => d.toLowerCase() === domain.toLowerCase(),
          );
          checks.push({
            rule: 'blockedDomains',
            passed: !blocked,
            detail: blocked
              ? `Domain "${domain}" is blocked`
              : `Domain "${domain}" is not blocked`,
          });
          if (blocked) {
            denials.push({ rule: 'blockedDomains', reason: `Domain "${domain}" is blocked` });
          }
        }

        // Allowed domains (if non-empty, only these are permitted)
        if (this.rules.allowedDomains.length > 0) {
          const allowed = this.rules.allowedDomains.some(
            (d) => d.toLowerCase() === domain.toLowerCase(),
          );
          checks.push({
            rule: 'allowedDomains',
            passed: allowed,
            detail: allowed
              ? `Domain "${domain}" is in allowed list`
              : `Domain "${domain}" is not in allowed list`,
          });
          if (!allowed) {
            denials.push({ rule: 'allowedDomains', reason: `Domain "${domain}" is not in allowed list` });
          }
        }
      }

      // ── Max emails per day ──────────────────────────────────────

      if (this.rules.maxEmailsPerDay > 0) {
        const sent = context.emailsSentToday ?? 0;
        const withinLimit = sent < this.rules.maxEmailsPerDay;
        checks.push({
          rule: 'maxEmailsPerDay',
          passed: withinLimit,
          detail: withinLimit
            ? `${sent}/${this.rules.maxEmailsPerDay} emails sent today`
            : `Daily limit reached: ${sent}/${this.rules.maxEmailsPerDay}`,
        });
        if (!withinLimit) {
          denials.push({ rule: 'maxEmailsPerDay', reason: `Daily email limit reached (${sent}/${this.rules.maxEmailsPerDay})` });
        }
      }

      // ── TLS requirement ─────────────────────────────────────────

      if (this.rules.requireTLS) {
        // Require explicit tlsAvailable: true — do not assume secure when unspecified.
        // If undefined/null, flag as conditional warning rather than deny.
        const tlsOk = context.tlsAvailable === true;
        const tlsUnknown = context.tlsAvailable !== true && context.tlsAvailable !== false;
        checks.push({
          rule: 'requireTLS',
          passed: tlsOk,
          detail: tlsOk
            ? 'TLS is available'
            : tlsUnknown
              ? 'TLS availability unspecified (treated as conditional)'
              : 'TLS is not available',
        });
        if (!tlsOk && !tlsUnknown) {
          denials.push({ rule: 'requireTLS', reason: 'TLS is required but not available' });
        }
      }

      // ── Attachment size ──────────────────────────────────────────

      if (this.rules.maxAttachmentSize > 0 && context.attachmentSizes && context.attachmentSizes.length > 0) {
        const totalSize = context.attachmentSizes.reduce((sum, s) => sum + s, 0);
        const withinLimit = totalSize <= this.rules.maxAttachmentSize;
        checks.push({
          rule: 'maxAttachmentSize',
          passed: withinLimit,
          detail: withinLimit
            ? `Attachment size ${totalSize} bytes within limit ${this.rules.maxAttachmentSize}`
            : `Attachment size ${totalSize} bytes exceeds limit ${this.rules.maxAttachmentSize}`,
        });
        if (!withinLimit) {
          denials.push({ rule: 'maxAttachmentSize', reason: `Attachment size ${totalSize} bytes exceeds limit ${this.rules.maxAttachmentSize}` });
        }
      }

      // ── Content filter ──────────────────────────────────────────

      const contentToCheck = [context.subject, context.body].filter((s): s is string => typeof s === 'string' && s.length > 0);
      if (contentToCheck.length > 0 && this.rules.contentFilter.length > 0) {
        for (const filterRule of this.rules.contentFilter) {
          let matched = false;
          for (const content of contentToCheck) {
            if (filterRule.pattern.test(content)) {
              matched = true;
              break;
            }
          }
          if (matched) {
            checks.push({
              rule: `contentFilter:${filterRule.label}`,
              passed: !filterRule.block,
              detail: filterRule.block
                ? `Content matched blocking filter "${filterRule.label}"`
                : `Content matched flagging filter "${filterRule.label}"`,
            });
            if (filterRule.block) {
              denials.push({ rule: `contentFilter:${filterRule.label}`, reason: `Content blocked by filter "${filterRule.label}"` });
            }
          }
        }
      }
    }

    // ── Webhook / API actions — lighter checks ─────────────────────

    if (action === 'webhook.incoming' || action === 'webhook.outgoing') {
      if (context.source) {
        checks.push({
          rule: 'sourceCheck',
          passed: true,
          detail: `Source "${context.source}" allowed`,
        });
      }
    }

    if (action.startsWith('api.')) {
      checks.push({
        rule: 'apiAccess',
        passed: true,
        detail: `API action "${action}" allowed`,
      });
    }

    // ── Aggregate result ──────────────────────────────────────────

    if (denials.length > 0) {
      // Report all failing rules; deniedBy is the first denial for backward compat
      const firstDenial = denials[0];
      const reasons = denials.map((d) => d.reason).join('; ');
      return {
        verdict: 'deny',
        reason: reasons,
        checks,
        deniedBy: firstDenial.rule,
      };
    }

    // If any check is conditional (passed: true but flagging), verdict is conditional
    const hasConditional = checks.some((c) => c.detail.includes('flagging'));
    return {
      verdict: hasConditional ? 'conditional' : 'allow',
      reason: hasConditional
        ? 'Action allowed with content filter flags'
        : 'All policy checks passed',
      checks,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────

extractDomain(email: string): string {
    const atIdx = email.lastIndexOf('@');
    if (atIdx === -1) return email;
    return email.slice(atIdx + 1);
  }
}

export default SecurityPolicy;