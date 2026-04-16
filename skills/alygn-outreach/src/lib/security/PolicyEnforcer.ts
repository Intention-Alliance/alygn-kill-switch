/**
 * PolicyEnforcer — H-102
 *
 * Enforces SecurityPolicy rules across EmailService, WebhookHandler, and
 * API-level actions. Wraps checkPolicy() results with audit logging and
 * integration hooks so that every policy decision is recorded.
 *
 * Methods:
 *   enforceEmailPolicy(context)  — for email.send / email.batch
 *   enforceWebhookPolicy(context) — for webhook.incoming / webhook.outgoing
 *   enforceApiPolicy(context)    — for api.read / api.write / api.general
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

import {
  SecurityPolicy,
  type PolicyAction,
  type PolicyContext,
  type PolicyResult,
  type SecurityPolicyRules,
} from './SecurityPolicy';
import type { AuditLogger } from '../audit/AuditLogger';

// ── Types ──────────────────────────────────────────────────────────────

export interface PolicyEnforcerOptions {
  /** SecurityPolicy rules (partial — merged with defaults) */
  rules?: Partial<SecurityPolicyRules>;
  /** Existing SecurityPolicy instance (overrides `rules` if provided) */
  policy?: SecurityPolicy;
  /** AuditLogger for recording policy decisions */
  auditLogger?: AuditLogger;
}

export interface EnforcedResult {
  /** Whether the action is allowed to proceed */
  allowed: boolean;
  /** The full PolicyResult from SecurityPolicy */
  policyResult: PolicyResult;
  /** Whether the decision was audit-logged */
  auditLogged: boolean;
}

// ── Implementation ─────────────────────────────────────────────────────

export class PolicyEnforcer {
  private readonly policy: SecurityPolicy;
  private auditLogger: AuditLogger | null;

  constructor(opts: PolicyEnforcerOptions = {}) {
    this.policy = opts.policy ?? new SecurityPolicy(opts.rules);
    this.auditLogger = opts.auditLogger ?? null;
  }

  /** Inject or replace the AuditLogger */
  setAuditLogger(logger: AuditLogger): void {
    this.auditLogger = logger;
  }

  /** Get the underlying SecurityPolicy (read-only access to rules) */
  getPolicy(): SecurityPolicy {
    return this.policy;
  }

  // ── Email policy enforcement ─────────────────────────────────────

  /**
   * Enforce security policy for email actions.
   * Checks domain allow/block lists, daily limits, TLS, attachments, and content.
   */
  async enforceEmailPolicy(context: PolicyContext): Promise<EnforcedResult> {
    const action: PolicyAction = 'email.send';
    const result = this.policy.checkPolicy(action, context);
    const allowed = result.verdict !== 'deny';

    await this.auditPolicyDecision('email', action, context, result);

    return {
      allowed,
      policyResult: result,
      auditLogged: this.auditLogger !== null,
    };
  }

  /**
   * Enforce security policy for batch email actions.
   * Same rules as enforceEmailPolicy but uses the batch action type.
   */
  async enforceBatchEmailPolicy(context: PolicyContext): Promise<EnforcedResult> {
    const action: PolicyAction = 'email.batch';
    const result = this.policy.checkPolicy(action, context);
    const allowed = result.verdict !== 'deny';

    await this.auditPolicyDecision('email', action, context, result);

    return {
      allowed,
      policyResult: result,
      auditLogged: this.auditLogger !== null,
    };
  }

  // ── Webhook policy enforcement ──────────────────────────────────

  /**
   * Enforce security policy for webhook actions.
   * Checks source validity and any webhook-specific rules.
   */
  async enforceWebhookPolicy(
    direction: 'incoming' | 'outgoing',
    context: PolicyContext,
  ): Promise<EnforcedResult> {
    const action: PolicyAction = direction === 'incoming'
      ? 'webhook.incoming'
      : 'webhook.outgoing';
    const result = this.policy.checkPolicy(action, context);
    const allowed = result.verdict !== 'deny';

    await this.auditPolicyDecision('webhook', action, context, result);

    return {
      allowed,
      policyResult: result,
      auditLogged: this.auditLogger !== null,
    };
  }

  // ── API policy enforcement ───────────────────────────────────────

  /**
   * Enforce security policy for API actions.
   * Checks API-level access rules and delegates to SecurityPolicy.
   */
  async enforceApiPolicy(
    type: 'read' | 'write' | 'general',
    context: PolicyContext,
  ): Promise<EnforcedResult> {
    const action: PolicyAction = `api.${type}` as PolicyAction;
    const result = this.policy.checkPolicy(action, context);
    const allowed = result.verdict !== 'deny';

    await this.auditPolicyDecision('api', action, context, result);

    return {
      allowed,
      policyResult: result,
      auditLogged: this.auditLogger !== null,
    };
  }

  // ── Generic enforcement ─────────────────────────────────────────

  /**
   * Enforce policy for any action type.
   * Useful when the action type is determined dynamically.
   */
  async enforce(
    action: PolicyAction,
    context: PolicyContext,
  ): Promise<EnforcedResult> {
    const result = this.policy.checkPolicy(action, context);
    const allowed = result.verdict !== 'deny';

    const domain = action.split('.')[0]; // 'email', 'webhook', or 'api'
    await this.auditPolicyDecision(domain, action, context, result);

    return {
      allowed,
      policyResult: result,
      auditLogged: this.auditLogger !== null,
    };
  }

  // ── Audit logging ───────────────────────────────────────────────

  private async auditPolicyDecision(
    domain: string,
    action: PolicyAction,
    context: PolicyContext,
    result: PolicyResult,
  ): Promise<void> {
    if (!this.auditLogger) return;

    try {
      await this.auditLogger.log(
        'PolicyEnforcer',
        `policy.${domain}`,
        context.recipient ?? context.source ?? action,
        {
          action,
          verdict: result.verdict,
          reason: result.reason,
          deniedBy: result.deniedBy ?? null,
          checksCount: result.checks.length,
          checksSummary: result.checks.map((c) => `${c.rule}=${c.passed}`).join(', '),
          recipient: context.recipient ?? null,
          sender: context.sender ?? null,
        },
        result.verdict === 'allow' ? 'success' : 'failure',
      );
    } catch {
      // Audit write failure must not block the action
    }
  }
}

export default PolicyEnforcer;