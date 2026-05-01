/**
 * EmailService
 * Orchestrates email sending with validation and error handling
 * 
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const EMAIL_DIR = path.resolve(ALYGN_DIR, 'lib/email');

// Dynamic import
const EmailProviderFactoryModule = await import(path.join(EMAIL_DIR, 'EmailProviderFactory.js'));
const { EmailProviderFactory } = EmailProviderFactoryModule;

export class EmailService {
  constructor(providerType, config) {
    this.provider = EmailProviderFactory.create(providerType, config);
    this.testEmail = null;
  }

  /**
   * Set test email override
   * All emails will be sent to this address instead
   * @param {string} email - Test email address
   */
  setTestEmail(email) {
    this.testEmail = email;
  }

  /**
   * Validate provider configuration
   */
  async validateConfig() {
    return await this.provider.validateConfig();
  }

  /**
   * Send a single email
   * @param {Object} payload - Email payload
   * @param {string} payload.to - Recipient email
   * @param {string} payload.from - Sender email
   * @param {string} payload.subject - Email subject
   * @param {string} payload.html - HTML content
   * @param {string} payload.text - Plain text content
   * @param {string} [payload.cc] - CC recipient (optional)
   * @returns {Promise<Object>}
   */
  async sendEmail(payload) {
    const { to, from, subject, html, text, cc } = payload;

    // Apply test email override if set
    const actualPayload = this.testEmail
      ? { to: this.testEmail, from, subject, html, text, cc }
      : payload;

    const result = await this.provider.send(actualPayload);

    return {
      ...result,
      testMode: !!this.testEmail,
      originalTo: this.testEmail ? payload.to : null
    };
  }

  /**
   * Send multiple emails with rate limiting
   * @param {Array<Object>} emails - Array of email payloads
   * @param {Object} options - Send options
   * @param {number} options.rateLimitMs - Milliseconds between sends (default: 3000)
   * @param {boolean} options.dryRun - If true, don't actually send
   * @returns {Promise<Object>} - Batch results
   */
  async sendBatch(emails, options = {}) {
    const { rateLimitMs = 3000, dryRun = false } = options;

    const results = {
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
        const result = await this.sendEmail(email);

        if (result.success) {
          results.sent++;
          results.campaigns.push({
            status: 'sent',
            ...result
          });
        } else {
          results.failed++;
          results.campaigns.push({
            status: 'failed',
            ...result
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
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Get current provider name
   * @returns {string}
   */
  getProviderName() {
    return this.provider.getName();
  }
}

export default EmailService;