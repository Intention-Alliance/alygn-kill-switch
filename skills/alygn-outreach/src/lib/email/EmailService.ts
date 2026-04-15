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

  constructor(providerType: string, config: Record<string, unknown>, sizeConstraints?: Partial<TemplateSizeConstraints>, queueConfig?: EmailQueueConfig, unsubscribeManager?: UnsubscribeManager) {
    this.providerType = providerType;
    this.providerConfig = config;
    this.templateValidator = new TemplateValidator(sizeConstraints);
    this.complianceValidator = new ComplianceValidator();
    this.unsubscribeManager = unsubscribeManager ?? new UnsubscribeManager();
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
  async sendEmail(payload: IEmailPayload): Promise<ISendResult> {
    await this.initialize();
    
    // Apply test email override if set
    const actualPayload: IEmailPayload = this.testEmail
      ? { ...payload, to: this.testEmail }
      : payload;

    const result = await this.provider!.send(actualPayload);

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