/**
 * ComplianceReportGenerator — H-107
 *
 * Generates compliance reports for a given time range across five
 * report types: gdpr, canSpam, securityAudit, accessReview,
 * dataClassification. Each report contains summary, findings,
 * recommendations, and a complianceScore (0–100).
 *
 * Pulls data from AuditLogger, PolicyEnforcer, AccessReviewScheduler,
 * DataClassifier, and SecurityScanner.
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

import type { AuditLogger, AuditQueryFilter, AuditQueryResult } from '../audit/AuditLogger';
import type { PolicyEnforcer } from './PolicyEnforcer';
import type { AccessReviewScheduler, ReviewItem, ReviewReport } from './AccessReviewScheduler';
import type { DataClassifier, ClassificationResult, SensitivityLevel, DataHandlingPolicy } from './DataClassifier';
import type { SecurityScanner, VulnerabilityReport } from './SecurityScanner';

// ── Types ──────────────────────────────────────────────────────────────

export type ComplianceReportType =
  | 'gdpr'
  | 'canSpam'
  | 'securityAudit'
  | 'accessReview'
  | 'dataClassification';

export interface CompliancePeriod {
  /** Inclusive start date (YYYY-MM-DD or ISO-8601) */
  from: string;
  /** Inclusive end date (YYYY-MM-DD or ISO-8601) */
  to: string;
}

export interface ComplianceFinding {
  /** Unique finding id */
  id: string;
  /** Severity: critical / high / medium / low / info */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Short title */
  title: string;
  /** Detailed description */
  description: string;
  /** Which data source produced this finding */
  source: string;
  /** ISO-8601 timestamp of the underlying event (or report generation time if N/A) */
  detectedAt: string;
}

export interface ComplianceRecommendation {
  /** Priority: critical / high / medium / low */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Short title */
  title: string;
  /** Detailed recommendation text */
  description: string;
  /** Which finding(s) this addresses (finding ids) */
  relatedFindings: string[];
}

export interface ComplianceReport {
  /** Report type */
  type: ComplianceReportType;
  /** Period covered */
  period: CompliancePeriod;
  /** ISO-8601 timestamp of report generation */
  generatedAt: string;
  /** High-level summary of compliance posture */
  summary: string;
  /** All findings */
  findings: ComplianceFinding[];
  /** Actionable recommendations */
  recommendations: ComplianceRecommendation[];
  /** Overall compliance score 0–100 (100 = fully compliant) */
  complianceScore: number;
}

export interface ComplianceReportGeneratorOptions {
  auditLogger?: AuditLogger;
  policyEnforcer?: PolicyEnforcer;
  accessReviewScheduler?: AccessReviewScheduler;
  dataClassifier?: DataClassifier;
  securityScanner?: SecurityScanner;
}

// ── Helpers ────────────────────────────────────────────────────────────

let _nextFindingId = 0;
function nextFindingId(): string {
  return `finding-${Date.now()}-${++_nextFindingId}`;
}

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
  info: 0,
};

function computeScore(findings: ComplianceFinding[]): number {
  let deduction = 0;
  for (const f of findings) {
    deduction += SEVERITY_WEIGHT[f.severity] ?? 0;
  }
  return Math.max(0, 100 - deduction);
}

// ── ComplianceReportGenerator ──────────────────────────────────────────

export class ComplianceReportGenerator {
  private readonly auditLogger: AuditLogger | null;
  private readonly policyEnforcer: PolicyEnforcer | null;
  private readonly accessReviewScheduler: AccessReviewScheduler | null;
  private readonly dataClassifier: DataClassifier | null;
  private readonly securityScanner: SecurityScanner | null;

  constructor(opts: ComplianceReportGeneratorOptions = {}) {
    this.auditLogger = opts.auditLogger ?? null;
    this.policyEnforcer = opts.policyEnforcer ?? null;
    this.accessReviewScheduler = opts.accessReviewScheduler ?? null;
    this.dataClassifier = opts.dataClassifier ?? null;
    this.securityScanner = opts.securityScanner ?? null;
  }

  /**
   * Generate a compliance report for the given type and period.
   */
  async generateReport(type: ComplianceReportType, period: CompliancePeriod): Promise<ComplianceReport> {
    switch (type) {
      case 'gdpr':
        return this.generateGdprReport(period);
      case 'canSpam':
        return this.generateCanSpamReport(period);
      case 'securityAudit':
        return this.generateSecurityAuditReport(period);
      case 'accessReview':
        return this.generateAccessReviewReport(period);
      case 'dataClassification':
        return this.generateDataClassificationReport(period);
      default:
        throw new Error(`ComplianceReportGenerator: unknown report type "${type}"`);
    }
  }

  // ── GDPR ──────────────────────────────────────────────────────────

  private async generateGdprReport(period: CompliancePeriod): Promise<ComplianceReport> {
    const findings: ComplianceFinding[] = [];
    const recommendations: ComplianceRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Check audit log for data access / PII handling events
    const auditEntries = await this.queryAuditLog(period);

    // Look for PII-related actions
    const piiActions = auditEntries.filter(
      (e) => e.action.includes('email') || e.action.includes('pii') || e.action.includes('data'),
    );
    const failedPiiActions = piiActions.filter((e) => e.result === 'failure');

    if (piiActions.length === 0 && this.auditLogger) {
      findings.push({
        id: nextFindingId(),
        severity: 'medium',
        title: 'No PII-related audit entries found',
        description:
          'The audit log contains no entries related to personal data processing for the reporting period. This may indicate that PII handling is not being audit-logged, which is a GDPR compliance gap.',
        source: 'AuditLogger',
        detectedAt: now,
      });
      recommendations.push({
        priority: 'high',
        title: 'Ensure all PII processing is audit-logged',
        description:
          'Configure PolicyEnforcer and DataClassifier to log all personal data access, modification, and deletion events to the AuditLogger.',
        relatedFindings: [findings[findings.length - 1].id],
      });
    }

    for (const entry of failedPiiActions) {
      findings.push({
        id: nextFindingId(),
        severity: 'high',
        title: 'Failed PII-related action',
        description: `Actor "${entry.actor}" performed action "${entry.action}" on target "${entry.target}" with result "${entry.result}". Failed PII actions may indicate unauthorized access attempts or policy violations.`,
        source: 'AuditLogger',
        detectedAt: entry.timestamp,
      });
    }

    // 2. Check DataClassifier for restricted data handling
    if (this.dataClassifier) {
      const policies = this.dataClassifier.getAllHandlingPolicies();
      const restrictedPolicy = policies['restricted'];
      const confidentialPolicy = policies['confidential'];

      if (restrictedPolicy && !restrictedPolicy.encryptionAtRest) {
        findings.push({
          id: nextFindingId(),
          severity: 'critical',
          title: 'Restricted data not encrypted at rest',
          description:
            'The DataClassifier handling policy for "restricted" data does not require encryption at rest. GDPR Article 32 requires appropriate technical measures to protect personal data.',
          source: 'DataClassifier',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'critical',
          title: 'Enable encryption at rest for restricted data',
          description: 'Update the DataClassifier handling policy to require encryptionAtRest for restricted data.',
          relatedFindings: [findings[findings.length - 1].id],
        });
      }

      if (confidentialPolicy && !confidentialPolicy.auditRequired) {
        findings.push({
          id: nextFindingId(),
          severity: 'high',
          title: 'Confidential data does not require audit logging',
          description:
            'The handling policy for "confidential" data does not mandate audit logging. GDPR accountability principle requires tracking of all personal data processing activities.',
          source: 'DataClassifier',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'high',
          title: 'Require audit logging for confidential data',
          description: 'Set auditRequired=true in the confidential handling policy.',
          relatedFindings: [findings[findings.length - 1].id],
        });
      }

      if (restrictedPolicy && restrictedPolicy.externalSharingAllowed) {
        findings.push({
          id: nextFindingId(),
          severity: 'critical',
          title: 'Restricted data allows external sharing',
          description:
            'The handling policy for "restricted" data permits external sharing. GDPR Article 44 restricts transfers of personal data outside the EEA unless adequate safeguards are in place.',
          source: 'DataClassifier',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'critical',
          title: 'Disable external sharing for restricted data',
          description: 'Set externalSharingAllowed=false for the restricted handling policy. Implement Data Processing Agreements for any necessary cross-border transfers.',
          relatedFindings: [findings[findings.length - 1].id],
        });
      }

      if (restrictedPolicy && restrictedPolicy.retentionDays === 0) {
        findings.push({
          id: nextFindingId(),
          severity: 'high',
          title: 'Restricted data has indefinite retention',
          description:
            'The handling policy for "restricted" data sets retentionDays=0 (indefinite). GDPR Article 5(1)(e) requires storage limitation — personal data must not be kept longer than necessary.',
          source: 'DataClassifier',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'high',
          title: 'Set a defined retention period for restricted data',
          description: 'Define a specific retention period (e.g., 30 or 90 days) for restricted data. Implement automated deletion or anonymization after the retention period.',
          relatedFindings: [findings[findings.length - 1].id],
        });
      }
    }

    // 3. Check AccessReviewScheduler for overdue reviews
    if (this.accessReviewScheduler) {
      const pendingReviews = this.accessReviewScheduler.getPendingReviews();
      const overdueReviews = pendingReviews.filter((r) => r.status === 'overdue');
      const staleReviews = pendingReviews.filter((r) => r.status === 'stale');

      if (overdueReviews.length > 0) {
        findings.push({
          id: nextFindingId(),
          severity: 'high',
          title: `${overdueReviews.length} overdue access review(s)`,
          description: `There are ${overdueReviews.length} access review items past their scheduled review date. GDPR Article 25 (data protection by design) requires regular access reviews to ensure least-privilege access to personal data.`,
          source: 'AccessReviewScheduler',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'high',
          title: 'Complete overdue access reviews',
          description: `Review and resolve ${overdueReviews.length} overdue access items. Consider automating access review reminders.`,
          relatedFindings: [findings[findings.length - 1].id],
        });
      }

      if (staleReviews.length > 0) {
        findings.push({
          id: nextFindingId(),
          severity: 'medium',
          title: `${staleReviews.length} stale access review(s)`,
          description: `There are ${staleReviews.length} access items that have not been reviewed in an extended period. Stale access may violate the GDPR principle of data minimization.`,
          source: 'AccessReviewScheduler',
          detectedAt: now,
        });
      }
    }

    // 4. Check SecurityScanner for vulnerabilities
    if (this.securityScanner) {
      const vulnReport = await this.securityScanner.scan();
      const criticalVulns = vulnReport.vulnerabilities.filter(
        (v) => v.severity === 'critical' || v.severity === 'high',
      );

      if (criticalVulns.length > 0) {
        findings.push({
          id: nextFindingId(),
          severity: 'critical',
          title: `${criticalVulns.length} critical/high security vulnerabilities detected`,
          description: `Security scan found ${criticalVulns.length} critical or high severity vulnerabilities. These may expose personal data and constitute GDPR Article 32 violations.`,
          source: 'SecurityScanner',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'critical',
          title: 'Remediate critical and high security vulnerabilities',
          description: `Address ${criticalVulns.length} critical/high findings from the latest security scan. Prioritize injection and path-traversal vulnerabilities.`,
          relatedFindings: [findings[findings.length - 1].id],
        });
      }
    }

    const score = computeScore(findings);
    const summary = this.buildGdprSummary(findings, score, period);

    return {
      type: 'gdpr',
      period,
      generatedAt: now,
      summary,
      findings,
      recommendations,
      complianceScore: score,
    };
  }

  // ── CAN-SPAM ──────────────────────────────────────────────────────

  private async generateCanSpamReport(period: CompliancePeriod): Promise<ComplianceReport> {
    const findings: ComplianceFinding[] = [];
    const recommendations: ComplianceRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Check audit log for email sending events
    const auditEntries = await this.queryAuditLog(period);
    const emailActions = auditEntries.filter((e) => e.action.startsWith('email'));
    const failedEmailActions = emailActions.filter((e) => e.result === 'failure');

    // Check for policy-denied emails (indicates enforcement is working)
    const policyDeniedEmails = emailActions.filter(
      (e) => e.action.includes('policy') && e.result === 'failure',
    );

    // If no email events at all, flag it
    if (emailActions.length === 0 && this.auditLogger) {
      findings.push({
        id: nextFindingId(),
        severity: 'low',
        title: 'No email activity in audit log',
        description:
          'No email sending events were recorded in the audit log for this period. If emails were sent, they should be logged for CAN-SPAM compliance.',
        source: 'AuditLogger',
        detectedAt: now,
      });
    }

    // 2. Check PolicyEnforcer for email policy configuration
    if (this.policyEnforcer) {
      const policy = this.policyEnforcer.getPolicy();
      const rules = policy.getRules();

      // Check for unsubscribe link requirement
      const hasUnsubscribeFilter = rules.contentFilter?.some(
        (f) => /unsubscribe/i.test(f.pattern.toString()),
      );
      if (!hasUnsubscribeFilter) {
        findings.push({
          id: nextFindingId(),
          severity: 'high',
          title: 'No unsubscribe link content filter configured',
          description:
            'The SecurityPolicy does not include a content filter requiring unsubscribe links. CAN-SPAM Section 5(a)(4) requires a clear and conspicuous unsubscribe mechanism in commercial emails.',
          source: 'PolicyEnforcer',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'high',
          title: 'Add unsubscribe link content filter',
          description:
            'Add a content filter rule to SecurityPolicy that checks for the presence of unsubscribe links in outgoing commercial emails.',
          relatedFindings: [findings[findings.length - 1].id],
        });
      }

      // Check daily email limits
      if (!rules.maxEmailsPerDay || rules.maxEmailsPerDay <= 0) {
        findings.push({
          id: nextFindingId(),
          severity: 'medium',
          title: 'No daily email limit configured',
          description:
            'The SecurityPolicy does not set a daily email limit (maxEmailsPerDay is 0/unlimited). Without limits, bulk email campaigns could violate CAN-SPAM requirements for honoring opt-out requests within 10 business days.',
          source: 'PolicyEnforcer',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'medium',
          title: 'Configure daily email limits',
          description: 'Set a reasonable maxEmailsPerDay in SecurityPolicy to prevent accidental bulk sends.',
          relatedFindings: [findings[findings.length - 1].id],
        });
      }
    } else {
      findings.push({
        id: nextFindingId(),
        severity: 'high',
        title: 'PolicyEnforcer not available',
        description:
          'No PolicyEnforcer is configured. Email policy enforcement is essential for CAN-SPAM compliance (opt-out handling, content requirements).',
        source: 'PolicyEnforcer',
        detectedAt: now,
      });
      recommendations.push({
        priority: 'high',
        title: 'Configure PolicyEnforcer for email compliance',
        description: 'Integrate PolicyEnforcer with email sending workflows to enforce CAN-SPAM requirements.',
        relatedFindings: [findings[findings.length - 1].id],
      });
    }

    // 3. Check for failed email sends (potential compliance issues)
    if (failedEmailActions.length > 0) {
      findings.push({
        id: nextFindingId(),
        severity: 'medium',
        title: `${failedEmailActions.length} failed email action(s)`,
        description: `${failedEmailActions.length} email actions failed during the reporting period. Failed sends may indicate recipients who have opted out but are still being targeted.`,
        source: 'AuditLogger',
        detectedAt: now,
      });
      recommendations.push({
        priority: 'medium',
        title: 'Review failed email actions',
        description: 'Investigate failed email sends to ensure opt-out lists are being properly honored.',
        relatedFindings: [findings[findings.length - 1].id],
      });
    }

    // 4. DataClassifier — check if email addresses are classified as PII
    if (this.dataClassifier) {
      const rules = this.dataClassifier.getRules();
      const emailRule = rules.find((r) => r.id === 'pii-email');
      if (!emailRule) {
        findings.push({
          id: nextFindingId(),
          severity: 'medium',
          title: 'Email addresses not classified as PII',
          description:
            'The DataClassifier does not have a rule classifying email addresses as PII. CAN-SPAM requires proper handling of recipient email data.',
          source: 'DataClassifier',
          detectedAt: now,
        });
      } else if (emailRule.level !== 'confidential' && emailRule.level !== 'restricted') {
        findings.push({
          id: nextFindingId(),
          severity: 'low',
          title: 'Email addresses classified below confidential level',
          description: `Email addresses are classified as "${emailRule.level}" rather than "confidential" or higher. Consider raising the classification to ensure proper data handling.`,
          source: 'DataClassifier',
          detectedAt: now,
        });
      }
    }

    const score = computeScore(findings);
    const summary = this.buildCanSpamSummary(findings, score, period);

    return {
      type: 'canSpam',
      period,
      generatedAt: now,
      summary,
      findings,
      recommendations,
      complianceScore: score,
    };
  }

  // ── Security Audit ───────────────────────────────────────────────

  private async generateSecurityAuditReport(period: CompliancePeriod): Promise<ComplianceReport> {
    const findings: ComplianceFinding[] = [];
    const recommendations: ComplianceRecommendation[] = [];
    const now = new Date().toISOString();

    // 1. Run SecurityScanner
    if (this.securityScanner) {
      const vulnReport = await this.securityScanner.scan();

      // Map vulnerability entries to compliance findings
      for (const vuln of vulnReport.vulnerabilities) {
        findings.push({
          id: nextFindingId(),
          severity: vuln.severity,
          title: vuln.title,
          description: vuln.description,
          source: `SecurityScanner.${vuln.checkName}`,
          detectedAt: vulnReport.scannedAt,
        });
      }

      // Generate recommendations from vulnerabilities
      const criticalHigh = vulnReport.vulnerabilities.filter(
        (v) => v.severity === 'critical' || v.severity === 'high',
      );
      if (criticalHigh.length > 0) {
        recommendations.push({
          priority: 'critical',
          title: 'Remediate critical and high severity vulnerabilities',
          description: `Address ${criticalHigh.length} critical/high findings. Review each vulnerability's remediation field for specific guidance.`,
          relatedFindings: findings.slice(-criticalHigh.length).map((f) => f.id),
        });
      }

      const medium = vulnReport.vulnerabilities.filter((v) => v.severity === 'medium');
      if (medium.length > 0) {
        recommendations.push({
          priority: 'medium',
          title: 'Address medium severity findings',
          description: `${medium.length} medium severity vulnerabilities should be remediated within 30 days.`,
          relatedFindings: findings.filter((f) => f.severity === 'medium').map((f) => f.id),
        });
      }
    } else {
      findings.push({
        id: nextFindingId(),
        severity: 'high',
        title: 'SecurityScanner not available',
        description: 'No SecurityScanner is configured. Security vulnerability scanning is essential for identifying injection, XSS, path traversal, and other threats.',
        source: 'SecurityScanner',
        detectedAt: now,
      });
      recommendations.push({
        priority: 'high',
        title: 'Configure SecurityScanner',
        description: 'Integrate SecurityScanner with TemplateEngine, EmailService, and other services for comprehensive vulnerability scanning.',
        relatedFindings: [findings[findings.length - 1].id],
      });
    }

    // 2. Check PolicyEnforcer for policy enforcement coverage
    if (this.policyEnforcer) {
      const policy = this.policyEnforcer.getPolicy();
      const rules = policy.getRules();

      // Check for TLS enforcement
      if (!rules.requireTLS) {
        findings.push({
          id: nextFindingId(),
          severity: 'high',
          title: 'TLS not required for email',
          description: 'The SecurityPolicy does not require TLS for email delivery. Unencrypted email transmission exposes content to interception.',
          source: 'PolicyEnforcer',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'high',
          title: 'Enable TLS requirement for email',
          description: 'Set requireTLS=true in SecurityPolicy to enforce encrypted email delivery.',
          relatedFindings: [findings[findings.length - 1].id],
        });
      }

      // Check for attachment size restrictions
      if (!rules.maxAttachmentSize || rules.maxAttachmentSize <= 0) {
        findings.push({
          id: nextFindingId(),
          severity: 'medium',
          title: 'No attachment size restrictions configured',
          description: 'The SecurityPolicy does not limit attachment sizes (maxAttachmentSize is 0/unlimited). Large or unrestricted attachments can be used to deliver malware.',
          source: 'PolicyEnforcer',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'medium',
          title: 'Configure attachment size limits',
          description: 'Set a reasonable maxAttachmentSize in SecurityPolicy to block oversized or potentially dangerous attachments.',
          relatedFindings: [findings[findings.length - 1].id],
        });
      }
    }

    // 3. Check audit log for security-relevant events
    const auditEntries = await this.queryAuditLog(period);
    const securityEvents = auditEntries.filter(
      (e) => e.action.includes('security') || e.action.includes('policy'),
    );
    const failedSecurityEvents = securityEvents.filter((e) => e.result === 'failure');

    if (failedSecurityEvents.length > 0) {
      findings.push({
        id: nextFindingId(),
        severity: 'medium',
        title: `${failedSecurityEvents.length} failed security event(s)`,
        description: `${failedSecurityEvents.length} security-related actions failed during the period. These may indicate attack attempts or misconfigured security controls.`,
        source: 'AuditLogger',
        detectedAt: now,
      });
    }

    // 4. Key rotation check (if we had KeyRotationManager — skip for now, no direct access)

    const score = computeScore(findings);
    const summary = this.buildSecurityAuditSummary(findings, score, period);

    return {
      type: 'securityAudit',
      period,
      generatedAt: now,
      summary,
      findings,
      recommendations,
      complianceScore: score,
    };
  }

  // ── Access Review ────────────────────────────────────────────────

  private async generateAccessReviewReport(period: CompliancePeriod): Promise<ComplianceReport> {
    const findings: ComplianceFinding[] = [];
    const recommendations: ComplianceRecommendation[] = [];
    const now = new Date().toISOString();

    if (!this.accessReviewScheduler) {
      findings.push({
        id: nextFindingId(),
        severity: 'high',
        title: 'AccessReviewScheduler not available',
        description: 'No AccessReviewScheduler is configured. Periodic access reviews are essential for least-privilege enforcement.',
        source: 'AccessReviewScheduler',
        detectedAt: now,
      });
      recommendations.push({
        priority: 'high',
        title: 'Configure AccessReviewScheduler',
        description: 'Integrate AccessReviewScheduler with TemplateAccessControl and AuditLogger to track and enforce periodic access reviews.',
        relatedFindings: [findings[0].id],
      });

      const score = computeScore(findings);
      return {
        type: 'accessReview',
        period,
        generatedAt: now,
        summary: 'Access review reporting unavailable — AccessReviewScheduler not configured.',
        findings,
        recommendations,
        complianceScore: score,
      };
    }

    // 1. Generate review report from scheduler
    const reviewReport = this.accessReviewScheduler.generateReport();

    // 2. Map review items to findings
    for (const item of reviewReport.attentionItems) {
      const severity: ComplianceFinding['severity'] =
        item.status === 'overdue' ? 'high' :
        item.status === 'stale' ? 'medium' :
        'low';

      findings.push({
        id: nextFindingId(),
        severity,
        title: `${item.status} access: ${item.role} → ${item.resource}`,
        description: `Role "${item.role}" has "${item.currentAccess}" access to "${item.resource}" with status "${item.status}". Last reviewed: ${item.lastReviewed ?? 'never'}.`,
        source: 'AccessReviewScheduler',
        detectedAt: item.lastReviewed ?? now,
      });
    }

    // 3. Check for roles without schedules
    const allItems = reviewReport.items;
    const rolesWithoutSchedule = new Set<string>();
    for (const item of allItems) {
      if (!this.accessReviewScheduler.getSchedule(item.role)) {
        rolesWithoutSchedule.add(item.role);
      }
    }

    if (rolesWithoutSchedule.size > 0) {
      findings.push({
        id: nextFindingId(),
        severity: 'medium',
        title: `${rolesWithoutSchedule.size} role(s) without review schedule`,
        description: `The following roles have no periodic review schedule: ${[...rolesWithoutSchedule].join(', ')}. Without scheduled reviews, access creep can go undetected.`,
        source: 'AccessReviewScheduler',
        detectedAt: now,
      });
      recommendations.push({
        priority: 'medium',
        title: 'Create review schedules for all roles',
        description: `Schedule periodic access reviews for roles: ${[...rolesWithoutSchedule].join(', ')}. Recommended interval: 90 days.`,
        relatedFindings: [findings[findings.length - 1].id],
      });
    }

    // 4. Recommendations based on status breakdown
    if (reviewReport.byStatus.overdue > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Complete overdue access reviews',
        description: `${reviewReport.byStatus.overdue} access items are overdue. Prioritize reviewing and resolving these to maintain least-privilege compliance.`,
        relatedFindings: findings.filter((f) => f.title.startsWith('overdue')).map((f) => f.id),
      });
    }

    if (reviewReport.byStatus.stale > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Review stale access items',
        description: `${reviewReport.byStatus.stale} access items are stale. Consider revoking unused access or confirming continued need.`,
        relatedFindings: findings.filter((f) => f.title.startsWith('stale')).map((f) => f.id),
      });
    }

    // 5. Cross-reference with audit log for access anomalies
    const auditEntries = await this.queryAuditLog(period);
    const accessAnomalies = auditEntries.filter(
      (e) => e.action.includes('access') && e.result === 'failure',
    );
    if (accessAnomalies.length > 0) {
      findings.push({
        id: nextFindingId(),
        severity: 'medium',
        title: `${accessAnomalies.length} failed access attempt(s)`,
        description: `${accessAnomalies.length} failed access attempts recorded in the audit log. These may indicate unauthorized access attempts.`,
        source: 'AuditLogger',
        detectedAt: now,
      });
    }

    const score = computeScore(findings);
    const summary = this.buildAccessReviewSummary(findings, score, period, reviewReport);

    return {
      type: 'accessReview',
      period,
      generatedAt: now,
      summary,
      findings,
      recommendations,
      complianceScore: score,
    };
  }

  // ── Data Classification ─────────────────────────────────────────

  private async generateDataClassificationReport(period: CompliancePeriod): Promise<ComplianceReport> {
    const findings: ComplianceFinding[] = [];
    const recommendations: ComplianceRecommendation[] = [];
    const now = new Date().toISOString();

    if (!this.dataClassifier) {
      findings.push({
        id: nextFindingId(),
        severity: 'high',
        title: 'DataClassifier not available',
        description: 'No DataClassifier is configured. Data classification is essential for applying appropriate security controls.',
        source: 'DataClassifier',
        detectedAt: now,
      });
      recommendations.push({
        priority: 'high',
        title: 'Configure DataClassifier',
        description: 'Integrate DataClassifier with PolicyEnforcer to enforce data handling policies based on sensitivity levels.',
        relatedFindings: [findings[0].id],
      });

      const score = computeScore(findings);
      return {
        type: 'dataClassification',
        period,
        generatedAt: now,
        summary: 'Data classification reporting unavailable — DataClassifier not configured.',
        findings,
        recommendations,
        complianceScore: score,
      };
    }

    // 1. Check handling policies for each sensitivity level
    const policies = this.dataClassifier.getAllHandlingPolicies();
    const levels: SensitivityLevel[] = ['public', 'internal', 'confidential', 'restricted'];

    for (const level of levels) {
      const policy = policies[level];

      // Check encryption requirements
      if ((level === 'confidential' || level === 'restricted') && !policy.encryptionAtRest) {
        findings.push({
          id: nextFindingId(),
          severity: level === 'restricted' ? 'critical' : 'high',
          title: `${level} data not encrypted at rest`,
          description: `The handling policy for "${level}" data does not require encryption at rest. Sensitive data should be encrypted to prevent unauthorized access.`,
          source: 'DataClassifier',
          detectedAt: now,
        });
        recommendations.push({
          priority: level === 'restricted' ? 'critical' : 'high',
          title: `Enable encryption at rest for ${level} data`,
          description: `Set encryptionAtRest=true in the ${level} handling policy.`,
          relatedFindings: [findings[findings.length - 1].id],
        });
      }

      if ((level === 'confidential' || level === 'restricted') && !policy.encryptionInTransit) {
        findings.push({
          id: nextFindingId(),
          severity: level === 'restricted' ? 'critical' : 'high',
          title: `${level} data not encrypted in transit`,
          description: `The handling policy for "${level}" data does not require encryption in transit. Data transmitted without encryption is vulnerable to interception.`,
          source: 'DataClassifier',
          detectedAt: now,
        });
      }

      // Check audit logging
      if ((level === 'confidential' || level === 'restricted') && !policy.auditRequired) {
        findings.push({
          id: nextFindingId(),
          severity: 'medium',
          title: `${level} data does not require audit logging`,
          description: `The handling policy for "${level}" data does not mandate audit logging. Without audit trails, unauthorized access may go undetected.`,
          source: 'DataClassifier',
          detectedAt: now,
        });
      }

      // Check external sharing
      if ((level === 'confidential' || level === 'restricted') && policy.externalSharingAllowed) {
        findings.push({
          id: nextFindingId(),
          severity: level === 'restricted' ? 'critical' : 'high',
          title: `${level} data allows external sharing`,
          description: `The handling policy for "${level}" data permits external sharing. Sensitive data should not be shared externally without proper safeguards.`,
          source: 'DataClassifier',
          detectedAt: now,
        });
      }

      // Check plain text logging
      if ((level === 'confidential' || level === 'restricted') && policy.plainTextLoggingAllowed) {
        findings.push({
          id: nextFindingId(),
          severity: 'medium',
          title: `${level} data allows plain text logging`,
          description: `The handling policy for "${level}" data permits plain text logging. Sensitive data should be redacted or hashed in logs.`,
          source: 'DataClassifier',
          detectedAt: now,
        });
        recommendations.push({
          priority: 'medium',
          title: `Disable plain text logging for ${level} data`,
          description: `Set plainTextLoggingAllowed=false in the ${level} handling policy.`,
          relatedFindings: [findings[findings.length - 1].id],
        });
      }

      // Check retention
      if ((level === 'restricted') && policy.retentionDays === 0) {
        findings.push({
          id: nextFindingId(),
          severity: 'high',
          title: `${level} data has indefinite retention`,
          description: `The handling policy for "${level}" data sets retentionDays=0 (indefinite). Sensitive data should have defined retention periods.`,
          source: 'DataClassifier',
          detectedAt: now,
        });
      }
    }

    // 2. Check classification rules coverage
    const rules = this.dataClassifier.getRules();
    const categories = new Set(rules.map((r) => r.category));
    const expectedCategories = ['pii-email', 'pii-phone', 'credential', 'financial'];
    for (const expected of expectedCategories) {
      if (!categories.has(expected as import('./DataClassifier').DataCategory)) {
        findings.push({
          id: nextFindingId(),
          severity: 'medium',
          title: `Missing classification rule for ${expected}`,
          description: `No classification rule exists for category "${expected}". Data of this type may not be properly classified or protected.`,
          source: 'DataClassifier',
          detectedAt: now,
        });
      }
    }

    // 3. Cross-reference with audit log for data handling events
    const auditEntries = await this.queryAuditLog(period);
    const dataEvents = auditEntries.filter(
      (e) => e.action.includes('data') || e.action.includes('classification'),
    );

    if (dataEvents.length === 0 && this.auditLogger) {
      findings.push({
        id: nextFindingId(),
        severity: 'low',
        title: 'No data classification events in audit log',
        description: 'No data classification events were recorded during the reporting period. Consider logging classification decisions for auditability.',
        source: 'AuditLogger',
        detectedAt: now,
      });
    }

    const score = computeScore(findings);
    const summary = this.buildDataClassificationSummary(findings, score, period, policies);

    return {
      type: 'dataClassification',
      period,
      generatedAt: now,
      summary,
      findings,
      recommendations,
      complianceScore: score,
    };
  }

  // ── Audit log query helper ────────────────────────────────────────

  private async queryAuditLog(period: CompliancePeriod): Promise<import('../audit/AuditLogger').AuditEntry[]> {
    if (!this.auditLogger) return [];

    const filter: AuditQueryFilter = {
      from: period.from,
      to: period.to,
    };

    const result: AuditQueryResult = await this.auditLogger.query(filter);
    return result.entries;
  }

  // ── Summary builders ─────────────────────────────────────────────

  private buildGdprSummary(findings: ComplianceFinding[], score: number, period: CompliancePeriod): string {
    const critical = findings.filter((f) => f.severity === 'critical').length;
    const high = findings.filter((f) => f.severity === 'high').length;
    return `GDPR compliance report for ${period.from} to ${period.to}. Score: ${score}/100. ${findings.length} findings (${critical} critical, ${high} high). ${score >= 80 ? 'Overall posture: acceptable.' : score >= 60 ? 'Overall posture: needs improvement.' : 'Overall posture: non-compliant — immediate action required.'}`;
  }

  private buildCanSpamSummary(findings: ComplianceFinding[], score: number, period: CompliancePeriod): string {
    const high = findings.filter((f) => f.severity === 'high').length;
    return `CAN-SPAM compliance report for ${period.from} to ${period.to}. Score: ${score}/100. ${findings.length} findings (${high} high). ${score >= 80 ? 'Email practices appear compliant.' : 'Email compliance gaps detected — review recommendations.'}`;
  }

  private buildSecurityAuditSummary(findings: ComplianceFinding[], score: number, period: CompliancePeriod): string {
    const critical = findings.filter((f) => f.severity === 'critical').length;
    const high = findings.filter((f) => f.severity === 'high').length;
    return `Security audit report for ${period.from} to ${period.to}. Score: ${score}/100. ${findings.length} findings (${critical} critical, ${high} high). ${score >= 80 ? 'Security posture: strong.' : score >= 60 ? 'Security posture: moderate — address high-severity findings.' : 'Security posture: weak — critical remediation needed.'}`;
  }

  private buildAccessReviewSummary(
    findings: ComplianceFinding[],
    score: number,
    period: CompliancePeriod,
    report: ReviewReport,
  ): string {
    return `Access review report for ${period.from} to ${period.to}. Score: ${score}/100. ${report.totalItems} total items: ${report.byStatus.completed} completed, ${report.byStatus.pending} pending, ${report.byStatus.overdue} overdue, ${report.byStatus.stale} stale. ${report.attentionItems.length} items require attention.`;
  }

  private buildDataClassificationSummary(
    findings: ComplianceFinding[],
    score: number,
    period: CompliancePeriod,
    policies: Record<SensitivityLevel, DataHandlingPolicy>,
  ): string {
    const restricted = policies['restricted'];
    const confidential = policies['confidential'];
    return `Data classification report for ${period.from} to ${period.to}. Score: ${score}/100. ${findings.length} findings. Restricted: encrypt=${restricted.encryptionAtRest ? 'yes' : 'no'}, audit=${restricted.auditRequired ? 'yes' : 'no'}. Confidential: encrypt=${confidential.encryptionAtRest ? 'yes' : 'no'}, audit=${confidential.auditRequired ? 'yes' : 'no'}.`;
  }

  // ── JSON export ──────────────────────────────────────────────────

  /**
   * Generate a report and export it as a JSON string.
   */
  async generateReportJson(type: ComplianceReportType, period: CompliancePeriod): Promise<string> {
    const report = await this.generateReport(type, period);
    return JSON.stringify(report, null, 2);
  }
}

export default ComplianceReportGenerator;