/**
 * ComplianceValidator — E-069
 * GDPR and CAN-SPAM compliance validation for outbound emails.
 * All checks are synchronous pure functions (< 10ms).
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type ComplianceCheckResult = 'pass' | 'fail' | 'warning';

export interface ComplianceViolation {
  /** Which regulation this check belongs to */
  regulation: 'GDPR' | 'CAN-SPAM';
  /** Machine-readable check identifier */
  rule: string;
  /** Human-readable description */
  message: string;
  /** pass / fail / warning */
  result: ComplianceCheckResult;
}

export interface ComplianceStatus {
  /** 0–100 score; 100 = fully compliant */
  score: number;
  /** True when score >= 80 AND no failing checks */
  isCompliant: boolean;
  /** All violations (fail + warning) */
  violations: ComplianceViolation[];
  /** Failing checks only */
  failures: ComplianceViolation[];
  /** Warning checks only */
  warnings: ComplianceViolation[];
  /** All checks including passes */
  checks: ComplianceViolation[];
}

export interface ComplianceEmailInput {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  /** True if recipient has given explicit consent */
  hasConsent?: boolean;
  /** Physical mailing address of sender (required by CAN-SPAM) */
  physicalAddress?: string;
  /** Whether the system supports right-to-erasure requests */
  supportsErasure?: boolean;
  /** Number of personal data fields collected/stored for this recipient */
  personalDataFieldsCount?: number;
}

// ── GDPR checks ────────────────────────────────────────────────────────────

function checkConsent(input: ComplianceEmailInput): ComplianceViolation {
  if (input.hasConsent) {
    return { regulation: 'GDPR', rule: 'consent', message: 'Recipient has given consent', result: 'pass' };
  }
  return { regulation: 'GDPR', rule: 'consent', message: 'No explicit consent recorded for recipient; cold outreach may require legitimate interest basis', result: 'warning' };
}

function checkErasureSupport(input: ComplianceEmailInput): ComplianceViolation {
  if (input.supportsErasure) {
    return { regulation: 'GDPR', rule: 'right-to-erasure', message: 'System supports right-to-erasure requests', result: 'pass' };
  }
  return { regulation: 'GDPR', rule: 'right-to-erasure', message: 'No right-to-erasure mechanism detected; GDPR Art. 17 requires data deletion on request', result: 'fail' };
}

function checkDataMinimization(input: ComplianceEmailInput): ComplianceViolation {
  const count = input.personalDataFieldsCount ?? 0;
  if (count === 0) {
    return { regulation: 'GDPR', rule: 'data-minimization', message: 'No personal data fields declared; cannot verify minimization', result: 'warning' };
  }
  if (count <= 5) {
    return { regulation: 'GDPR', rule: 'data-minimization', message: `Personal data fields: ${count} — within reasonable bounds`, result: 'pass' };
  }
  return { regulation: 'GDPR', rule: 'data-minimization', message: `Personal data fields: ${count} — consider reducing to what is strictly necessary (GDPR Art. 5(1)(c))`, result: 'warning' };
}

function checkUnsubscribeLinkGDPR(input: ComplianceEmailInput): ComplianceViolation {
  const html = input.html ?? '';
  const text = input.text ?? '';
  const hasUnsubscribe = /unsubscribe|opt.out|desuscribir/i.test(html) || /unsubscribe|opt.out|desuscribir/i.test(text);
  if (hasUnsubscribe) {
    return { regulation: 'GDPR', rule: 'unsubscribe-link', message: 'Unsubscribe/opt-out link present', result: 'pass' };
  }
  return { regulation: 'GDPR', rule: 'unsubscribe-link', message: 'No unsubscribe or opt-out link found in email body', result: 'fail' };
}

function checkSenderIdentityGDPR(input: ComplianceEmailInput): ComplianceViolation {
  const from = input.from ?? '';
  // Must not be obviously anonymous or misleading
  if (!from || from.length === 0) {
    return { regulation: 'GDPR', rule: 'sender-identity', message: 'No sender identity (from address) provided', result: 'fail' };
  }
  if (/^(noreply|no-reply|donotreply|do-not-reply)@/i.test(from)) {
    return { regulation: 'GDPR', rule: 'sender-identity', message: 'Sender address appears to be a no-reply address; GDPR encourages identifiable senders', result: 'warning' };
  }
  return { regulation: 'GDPR', rule: 'sender-identity', message: 'Sender identity disclosed', result: 'pass' };
}

// ── CAN-SPAM checks ────────────────────────────────────────────────────────

function checkPhysicalAddress(input: ComplianceEmailInput): ComplianceViolation {
  const html = input.html ?? '';
  const text = input.text ?? '';
  // Look for common address patterns in footer
  const addressPatterns = /(\d+\s+[A-Za-z]+\s+(St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Rd|Road|Ln|Lane|Way|Pkwy|Parkway|Suite|Ste|Unit|#)|P\.?O\.?\s*Box|Texas|EE\.UU|Estados Unidos|United States)/i;
  const hasAddress = addressPatterns.test(html) || addressPatterns.test(text) || !!input.physicalAddress;
  if (hasAddress) {
    return { regulation: 'CAN-SPAM', rule: 'physical-address', message: 'Physical address present in email or provided', result: 'pass' };
  }
  return { regulation: 'CAN-SPAM', rule: 'physical-address', message: 'No physical mailing address found; CAN-SPAM §7703 requires a valid physical address', result: 'fail' };
}

function checkSenderIdCANSPAM(input: ComplianceEmailInput): ComplianceViolation {
  const from = input.from ?? '';
  if (!from || from.length === 0) {
    return { regulation: 'CAN-SPAM', rule: 'sender-id', message: 'No sender (from) address provided; CAN-SPAM requires clear sender identification', result: 'fail' };
  }
  // Check for misleading from addresses
  if (/@(gmail|yahoo|hotmail|outlook)\.com$/i.test(from)) {
    return { regulation: 'CAN-SPAM', rule: 'sender-id', message: 'From address uses generic consumer email; consider using a branded domain for clearer sender identification', result: 'warning' };
  }
  return { regulation: 'CAN-SPAM', rule: 'sender-id', message: 'Sender clearly identified', result: 'pass' };
}

function checkTruthfulSubject(input: ComplianceEmailInput, brandName?: string): ComplianceViolation {
  const subject = input.subject ?? '';
  if (!subject || subject.trim().length === 0) {
    return { regulation: 'CAN-SPAM', rule: 'truthful-subject', message: 'Subject line is empty; CAN-SPAM requires non-deceptive subject lines', result: 'fail' };
  }
  // Check for RE:/FWD: prefix — always flag as potential deception
  const hasReOrFwd = /^(RE:|FWD:|Fw:)/i.test(subject.trim());
  if (hasReOrFwd) {
    return { regulation: 'CAN-SPAM', rule: 'truthful-subject', message: 'Subject line starts with RE:/FWD: but may not be a reply/forward; CAN-SPAM prohibits misleading subjects', result: 'warning' };
  }
  // If brandName is configured, warn when subject lacks it
  if (brandName && !new RegExp(`\\b${brandName}\\b`, 'i').test(subject)) {
    return { regulation: 'CAN-SPAM', rule: 'truthful-subject', message: `Subject line does not contain brand name "${brandName}"; including it improves sender recognition`, result: 'warning' };
  }
  // Check for excessive ALL CAPS or clickbait
  const capsRatio = (subject.match(/[A-Z]/g) || []).length / subject.length;
  if (capsRatio > 0.7 && subject.length > 10) {
    return { regulation: 'CAN-SPAM', rule: 'truthful-subject', message: 'Subject line appears to be mostly ALL CAPS; may be perceived as deceptive or spam-like', result: 'warning' };
  }
  return { regulation: 'CAN-SPAM', rule: 'truthful-subject', message: 'Subject line appears truthful', result: 'pass' };
}

function checkUnsubscribeMechanismCANSPAM(input: ComplianceEmailInput): ComplianceViolation {
  const html = input.html ?? '';
  const text = input.text ?? '';
  const hasUnsubscribe = /unsubscribe|opt.out|desuscribir|remove/i.test(html) || /unsubscribe|opt.out|desuscribir|remove/i.test(text);
  if (hasUnsubscribe) {
    return { regulation: 'CAN-SPAM', rule: 'unsubscribe-mechanism', message: 'Unsubscribe mechanism present', result: 'pass' };
  }
  return { regulation: 'CAN-SPAM', rule: 'unsubscribe-mechanism', message: 'No unsubscribe mechanism found; CAN-SPAM §7704 requires a clear opt-out method', result: 'fail' };
}

function checkMisleadingFromAddress(input: ComplianceEmailInput): ComplianceViolation {
  const from = input.from ?? '';
  if (!from || from.length === 0) {
    return { regulation: 'CAN-SPAM', rule: 'misleading-from', message: 'No from address to evaluate', result: 'fail' };
  }
  // Check for spoofed-looking or deceptive from names
  const misleadingPatterns = /"(noreply|admin|support|info)"/i;
  if (misleadingPatterns.test(from)) {
    return { regulation: 'CAN-SPAM', rule: 'misleading-from', message: 'From display name may appear misleading; ensure it accurately identifies the sender', result: 'warning' };
  }
  return { regulation: 'CAN-SPAM', rule: 'misleading-from', message: 'From address does not appear misleading', result: 'pass' };
}

// ── ComplianceValidator class ───────────────────────────────────────────────

export class ComplianceValidator {
  private brandName?: string;

  constructor(options?: { brandName?: string }) {
    this.brandName = options?.brandName;
  }

  /**
   * Validate an email payload against GDPR and CAN-SPAM rules.
   * Returns a ComplianceStatus with score, violations, and compliance flag.
   */
  validate(input: ComplianceEmailInput): ComplianceStatus {
    const checks: ComplianceViolation[] = [
      // GDPR
      checkConsent(input),
      checkErasureSupport(input),
      checkDataMinimization(input),
      checkUnsubscribeLinkGDPR(input),
      checkSenderIdentityGDPR(input),
      // CAN-SPAM
      checkPhysicalAddress(input),
      checkSenderIdCANSPAM(input),
      checkTruthfulSubject(input, this.brandName),
      checkUnsubscribeMechanismCANSPAM(input),
      checkMisleadingFromAddress(input),
    ];

    const failures = checks.filter((c) => c.result === 'fail');
    const warnings = checks.filter((c) => c.result === 'warning');
    const violations = [...failures, ...warnings];

    // Score: start at 100, -15 per fail, -5 per warning
    const score = Math.max(0, 100 - failures.length * 15 - warnings.length * 5);

    return {
      score,
      isCompliant: score >= 80 && failures.length === 0,
      violations,
      failures,
      warnings,
      checks,
    };
  }

  /**
   * Quick boolean check — true if email passes compliance.
   */
  isCompliant(input: ComplianceEmailInput): boolean {
    return this.validate(input).isCompliant;
  }
}

export default ComplianceValidator;