/**
 * EmailService
 * Orchestrates email sending with validation and error handling
 */
import { EmailProvider } from './providers/EmailProvider';
import type { IEmailPayload, ISendResult } from './providers/EmailProvider';
import { EmailProviderFactory } from './EmailProviderFactory';

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
  private providerType: string;
  private providerConfig: Record<string, unknown>;

  constructor(providerType: string, config: Record<string, unknown>) {
    this.providerType = providerType;
    this.providerConfig = config;
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
   * Send a single email
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
   * Get current provider name
   */
  getProviderName(): string {
    return this.provider?.getName() || 'unknown';
  }
}

export default EmailService;
