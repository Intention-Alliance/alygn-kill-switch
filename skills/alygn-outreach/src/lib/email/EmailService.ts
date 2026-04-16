/**
 * EmailService
 * Orchestrates email sending with validation and error handling
 */
import { EmailProvider } from './providers/EmailProvider';
import type { IEmailPayload, ISendResult } from './providers/EmailProvider';
import { EmailProviderFactory } from './EmailProviderFactory';
import { EmailQueue, type EmailQueueConfig, type EmailPriority } from './EmailQueue';
import { TemplateValidator } from './validators/TemplateValidator';
import type { EmailTemplateInput, TemplateSizeConstraints, TemplateValidationResult } from './validators/TemplateValidator';
import { ComplianceValidator, type ComplianceEmailInput, type ComplianceStatus } from './ComplianceValidator';
import { UnsubscribeManager } from './UnsubscribeManager';
import type { AuditLogger } from '../audit/AuditLogger';
import { TemplateVersion } from './TemplateVersion';
import { TemplateRegistry } from './TemplateRegistry';
import type { EndpointRateLimiter } from '../security/EndpointRateLimiter';
import type { PolicyEnforcer, EnforcedResult } from '../security/PolicyEnforcer';
import type { PolicyContext } from '../security/SecurityPolicy';

interface BatchEmailPayload {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  cc?: string;
}

interface BatchResult {
  sent: number;
  failed: number;
  total: number;
  campaigns: Array<{
    status: string;
    to?: string;
    subject?: string;
    wouldSend?: boolean;
    success?: boolean;
    messageId?: string;
    error?: string;
  }>;
}

export class EmailService {
  provider: EmailProvider | null = null;
  testEmail: string | null = null;
  queue: EmailQueue;
  private providerType: string;
  private providerConfig: Record<string, unknown>;
  private templateValidator: TemplateValidator;
  private complianceValidator: ComplianceValidator;
  private unsubscribeManager: UnsubscribeManager;
  private templateRegistry: TemplateRegistry;
  private auditLogger: AuditLogger | null = null;
  private endpointRateLimiter: EndpointRateLimiter | null = null;
  private policyEnforcer: PolicyEnforcer | null = null;

  constructor(providerType: string, config: Record<string, unknown>, sizeConstraints?: Partial<TemplateSizeConstraints>, queueConfig?: EmailQueueConfig, unsubscribeManager?: UnsubscribeManager) {
    this.providerType = providerType;
    this.providerConfig = config;
    this.templateValidator = new TemplateValidator(sizeConstraints);
    this.complianceValidator = new ComplianceValidator();
    this.unsubscribeManager = unsubscribeManager ?? new UnsubscribeManager();
    this.templateRegistry = new TemplateRegistry();
    this.queue = new EmailQueue(queueConfig);
    this.queue.setSendFn(async (payload) => {
      await this.initialize();
      const actualPayload: IEmailPayload = this.testEmail
        ? { ...payload, to: this.testEmail }
        : payload;
      const result = await this.provider!.send(actualPayload);
      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      };
    });
  }

  /**
   * Initialize the email provider
   */
  private async initialize(): Promise<void> {
    if (this.provider) return;
    
    try {
      this.provider = await EmailProviderFactory.create(this.providerType, this.providerConfig);
    } catch (error) {
      console.error('Failed to initialize email provider:', error);
      throw error;
    }
  }

  /**
   * Set test email override
   * All emails will be sent to this address instead
   */
  setTestEmail(email: string): void {
    this.testEmail = email;
  }

  /**
   * Validate provider configuration
   */
  async validateConfig(): Promise<boolean> {
    await this.initialize();
    return await this.provider!.validateConfig();
  }

  /**
   * Send a single email (no template validation — backward compatible)
   */
  /** Inject AuditLogger for audit trail */
  setAuditLogger(logger: AuditLogger): void {
    this.auditLogger = logger;
  }

  /** Inject EndpointRateLimiter for per-endpoint rate limiting */
  setEndpointRateLimiter(limiter: EndpointRateLimiter): void {
    this.endpointRateLimiter = limiter;
  }

  /** Get the EndpointRateLimiter instance (if set) */
  getEndpointRateLimiter(): EndpointRateLimiter | null {
    return this.endpointRateLimiter;
  }

  /** Inject PolicyEnforcer for security policy checks before sending */
  setPolicyEnforcer(enforcer: PolicyEnforcer): void {
    this.policyEnforcer = enforcer;
  }

  /** Get the PolicyEnforcer instance (if set) */
  getPolicyEnforcer(): PolicyEnforcer | null {
    return this.policyEnforcer;
  }

  async sendEmail(payload: IEmailPayload): Promise<ISendResult> {
    await this.initialize();

    // Per-endpoint rate limit check
    if (this.endpointRateLimiter) {
      const check = this.endpointRateLimiter.canSendEmail();
      if (!check.allowed) {
        return {
          success: false,
          to: payload.to,
          subject: payload.subject,
          error: check.reason ?? 'Email send rate limit exceeded',
        };
      }
    }

    // Security policy enforcement
    if (this.policyEnforcer) {
      const policyCtx: PolicyContext = {
        recipient: payload.to,
        sender: payload.from,
        subject: payload.subject,
        body: payload.html ?? payload.text,
        attachmentSizes: undefined,
        tlsAvailable: true,
      };
      const enforcement: EnforcedResult = await this.policyEnforcer.enforceEmailPolicy(policyCtx);
      if (!enforcement.allowed) {
        return {
          success: false,
          to: payload.to,
          subject: payload.subject,
          error: enforcement.policyResult.reason,
        };
      }
    }

    // Apply test email override if set
    const actualPayload: IEmailPayload = this.testEmail
      ? { ...payload, to: this.testEmail }
      : payload;

    const result = await this.provider!.send(actualPayload);

    // Audit log
    if (this.auditLogger) {
      await this.auditLogger.log(
        'EmailService',
        'email.send',
        payload.to,
        { subject: payload.subject, provider: result.provider, messageId: result.messageId },
        result.success ? 'success' : 'failure',
      ).catch(() => {});
    }

    return {
      ...result,
      success: result.success,
      messageId: result.messageId,
      provider: result.provider,
      to: this.testEmail ? payload.to : result.to,
      subject: result.subject,
      error: result.error
    };
  }

  /**
   * Send multiple emails with rate limiting
   */
  async sendBatch(
    emails: BatchEmailPayload[], 
    options: { rateLimitMs?: number; dryRun?: boolean } = {}
  ): Promise<BatchResult> {
    const { rateLimitMs = 3000, dryRun = false } = options;

    await this.initialize();

    const results: BatchResult = {
      sent: 0,
      failed: 0,
      total: emails.length,
      campaigns: []
    };

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];

      if (dryRun) {
        results.campaigns.push({
          status: 'dry_run',
          to: this.testEmail || email.to,
          subject: email.subject,
          wouldSend: true
        });
        results.sent++;
        continue;
      }

      try {
        const result = await this.sendEmail({
          to: email.to,
          from: email.from,
          subject: email.subject,
          html: email.html,
          text: email.text,
          cc: email.cc
        });

        if (result.success) {
          results.sent++;
          results.campaigns.push({
            status: 'sent',
            to: result.to,
            subject: result.subject,
            success: true,
            messageId: result.messageId
          });
        } else {
          results.failed++;
          results.campaigns.push({
            status: 'failed',
            to: email.to,
            subject: email.subject,
            success: false,
            error: result.error
          });
        }

        // Rate limit between sends (except last one)
        if (i < emails.length - 1 && rateLimitMs > 0) {
          await new Promise(resolve => setTimeout(resolve, rateLimitMs));
        }
      } catch (error) {
        results.failed++;
        results.campaigns.push({
          status: 'error',
          to: email.to,
          subject: email.subject,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  /**
   * Send emails via the queue system (priority-based, retry, rate-limited)
   * Returns queue item IDs for tracking
   */
  async sendQueued(
    emails: BatchEmailPayload[],
    options: { priority?: EmailPriority; dryRun?: boolean } = {}
  ): Promise<{ ids: string[]; queued: number; dryRun: boolean }> {
    const { priority = 'medium', dryRun = false } = options;

    if (dryRun) {
      return { ids: [], queued: emails.length, dryRun: true };
    }

    await this.initialize();
    const ids: string[] = [];

    for (const email of emails) {
      const id = await this.queue.enqueue(
        {
          to: email.to,
          from: email.from,
          subject: email.subject,
          html: email.html,
          text: email.text,
          cc: email.cc,
        },
        priority,
      );
      ids.push(id);
    }

    this.queue.drain(); // fire-and-forget; queue processes in background
    return { ids, queued: ids.length, dryRun: false };
  }

  /**
   * Get current provider name
   */
  getProviderName(): string {
    return this.provider?.getName() || 'unknown';
  }

  /**
   * Graceful shutdown — persists queue and stops processing
   */
  async shutdown(): Promise<void> {
    this.queue.stop();
    await this.queue.persist();
  }

  /**
   * Validate an email template without sending.
   * Useful for pre-flight checks before batch sends.
   */
  validateTemplate(input: EmailTemplateInput): TemplateValidationResult {
    return this.templateValidator.validate(input);
  }

  /**
   * Send a single email with template validation first.
   * If validation fails (any errors), the email is NOT sent and a failed
   * ISendResult is returned. Warnings are logged but do not block sending.
   *
   * Backward compatible: sendEmail() still works without validation.
   */
  async sendWithValidation(
    payload: IEmailPayload,
    language?: 'es' | 'en',
  ): Promise<ISendResult> {
    const templateInput: EmailTemplateInput = {
      subject: payload.subject,
      html: payload.html || '',
      text: payload.text,
      language,
    };

    const result = this.templateValidator.validate(templateInput);

    if (!result.valid) {
      const errorSummary = result.errors
        .map((e) => `[${e.rule}] ${e.message}`)
        .join('; ');
      console.error(`[EmailService] Template validation failed — email NOT sent: ${errorSummary}`);

      if (result.warnings.length > 0) {
        const warnSummary = result.warnings
          .map((w) => `[${w.rule}] ${w.message}`)
          .join('; ');
        console.warn(`[EmailService] Template validation warnings: ${warnSummary}`);
      }

      return {
        success: false,
        to: payload.to,
        subject: payload.subject,
        error: `Template validation failed: ${errorSummary}`,
      };
    }

    // Log warnings but proceed
    if (result.warnings.length > 0) {
      const warnSummary = result.warnings
        .map((w) => `[${w.rule}] ${w.message}`)
        .join('; ');
      console.warn(`[EmailService] Template validation warnings: ${warnSummary}`);
    }

    return this.sendEmail(payload);
  }

  /**
   * Send a single email with full compliance validation.
   * Checks GDPR + CAN-SPAM compliance and unsubscribe status before sending.
   * If compliance fails or recipient is unsubscribed, email is NOT sent.
   */
  async sendWithCompliance(
    payload: IEmailPayload,
    options?: {
      language?: 'es' | 'en';
      hasConsent?: boolean;
      physicalAddress?: string;
      supportsErasure?: boolean;
      personalDataFieldsCount?: number;
    },
  ): Promise<ISendResult & { compliance?: ComplianceStatus }> {
    // 1. Check unsubscribe list
    if (this.unsubscribeManager.isUnsubscribed(payload.to)) {
      console.warn(`[EmailService] Recipient ${payload.to} has unsubscribed — email NOT sent`);
      return {
        success: false,
        to: payload.to,
        subject: payload.subject,
        error: `Recipient ${payload.to} has unsubscribed`,
      };
    }

    // 2. Run compliance validation
    const complianceInput: ComplianceEmailInput = {
      to: payload.to,
      from: payload.from,
      subject: payload.subject,
      html: payload.html ?? '',
      text: payload.text,
      hasConsent: options?.hasConsent,
      physicalAddress: options?.physicalAddress,
      supportsErasure: options?.supportsErasure,
      personalDataFieldsCount: options?.personalDataFieldsCount,
    };

    const compliance = this.complianceValidator.validate(complianceInput);

    if (!compliance.isCompliant) {
      const failSummary = compliance.failures
        .map((v) => `[${v.regulation}:${v.rule}] ${v.message}`)
        .join('; ');
      console.error(`[EmailService] Compliance check failed — email NOT sent: ${failSummary}`);

      if (compliance.warnings.length > 0) {
        const warnSummary = compliance.warnings
          .map((v) => `[${v.regulation}:${v.rule}] ${v.message}`)
          .join('; ');
        console.warn(`[EmailService] Compliance warnings: ${warnSummary}`);
      }

      return {
        success: false,
        to: payload.to,
        subject: payload.subject,
        error: `Compliance check failed (score ${compliance.score}): ${failSummary}`,
        compliance,
      };
    }

    // Log warnings but proceed
    if (compliance.warnings.length > 0) {
      const warnSummary = compliance.warnings
        .map((v) => `[${v.regulation}:${v.rule}] ${v.message}`)
        .join('; ');
      console.warn(`[EmailService] Compliance warnings: ${warnSummary}`);
    }

    // 3. Delegate to sendWithValidation for template checks
    const sendResult = await this.sendWithValidation(payload, options?.language);

    return { ...sendResult, compliance };
  }

  /**
   * Send an email using a versioned template from the registry.
   * Records which template version was used in the result for audit purposes.
   * If templateVersion is specified, validates compatibility with the registered template.
   *
   * @param payload - Email payload (subject, html, text, to, from, etc.)
   * @param templateName - Name of the template in the registry
   * @param templateVersion - Optional specific version; defaults to latest
   * @param options - Optional compliance/validation options
   */
  async sendWithVersion(
    payload: IEmailPayload,
    templateName: string,
    templateVersion?: TemplateVersion | string,
    options?: {
      language?: 'es' | 'en';
      hasConsent?: boolean;
      physicalAddress?: string;
      supportsErasure?: boolean;
      personalDataFieldsCount?: number;
    },
  ): Promise<ISendResult & { templateVersion?: string; compliance?: ComplianceStatus }> {
    // Resolve version
    const v = templateVersion
      ? (typeof templateVersion === 'string'
        ? TemplateVersion.parse(templateVersion)
        : templateVersion)
      : undefined;

    // Look up template in registry
    const entry = this.templateRegistry.get(templateName, v);
    if (!entry) {
      const versionStr = v ? v.toString() : 'latest';
      console.error(`[EmailService] Template "${templateName}" version ${versionStr} not found in registry`);
      return {
        success: false,
        to: payload.to,
        subject: payload.subject,
        error: `Template "${templateName}" version ${versionStr} not found in registry`,
      };
    }

    // If a specific version was requested, check compatibility with latest
    if (v) {
      const latest = this.templateRegistry.getLatest(templateName);
      if (latest) {
        const requestedV = TemplateVersion.parse(entry.version);
        const latestV = TemplateVersion.parse(latest.version);
        if (!requestedV.isCompatible(latestV)) {
          console.warn(
            `[EmailService] Template "${templateName}" version ${entry.version} is not compatible with latest ${latest.version} (major version mismatch)`,
          );
        }
      }
    }

    // Merge template content with payload (template content as html/text if payload doesn't override)
    const mergedPayload: IEmailPayload = {
      ...payload,
      html: payload.html || entry.content,
    };

    // Delegate to sendWithCompliance for full validation
    const result = await this.sendWithCompliance(mergedPayload, {
      language: options?.language,
      hasConsent: options?.hasConsent,
      physicalAddress: options?.physicalAddress,
      supportsErasure: options?.supportsErasure,
      personalDataFieldsCount: options?.personalDataFieldsCount,
    });

    return {
      ...result,
      templateVersion: entry.version,
    };
  }

  /**
   * Get the TemplateRegistry instance for external use (registering templates, etc.).
   */
  getTemplateRegistry(): TemplateRegistry {
    return this.templateRegistry;
  }

  /**
   * Get the UnsubscribeManager instance for external use.
   */
  getUnsubscribeManager(): UnsubscribeManager {
    return this.unsubscribeManager;
  }

  /**
   * Get the ComplianceValidator instance for external use.
   */
  getComplianceValidator(): ComplianceValidator {
    return this.complianceValidator;
  }
}

export default EmailService;