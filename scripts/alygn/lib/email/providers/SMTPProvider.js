/**
 * SMTP Email Provider
 * Sends emails via SMTP using nodemailer
 * 
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */
import nodemailer from 'nodemailer';
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const EMAIL_DIR = path.resolve(ALYGN_DIR, 'lib/email');
const PROVIDERS_DIR = path.resolve(EMAIL_DIR, 'providers');

// Dynamic import
const EmailProviderModule = await import(path.join(PROVIDERS_DIR, 'EmailProvider.js'));
const { EmailProvider } = EmailProviderModule;

export class SMTPProvider extends EmailProvider {
  constructor(config) {
    super();
    this.config = config;
    this.transporter = null;
  }

  /**
   * Initialize SMTP transporter
   */
  async initialize() {
    if (this.transporter) return;

    const { server, port, user, password, secure = false } = this.config;

    this.transporter = nodemailer.createTransport({
      host: server,
      port: port,
      secure: secure,
      auth: {
        user: user,
        pass: password
      }
    });
  }

  /**
   * Send email via SMTP
   */
  async send(payload) {
    await this.initialize();

    const { to, subject, html, text, from, cc, headers = {} } = payload;

    try {
      const mailOptions = {
        from: from || `Alygn R&D <${this.config.user}>`,
        to: to,
        subject: subject,
        text: text || html?.replace(/<[^>]*>/g, ''),
        html: html,
        headers: headers,
        // Add CC if present
        ...(cc && { cc })
      };

      const info = await this.transporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        provider: this.getName(),
        to: to,
        subject: subject,
        cc: cc || null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        provider: this.getName(),
        to: to,
        subject: subject
      };
    }
  }

  /**
   * Validate SMTP configuration
   */
  async validateConfig() {
    try {
      await this.initialize();
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('SMTP config validation failed:', error.message);
      return false;
    }
  }

  /**
   * Get provider name
   */
  getName() {
    return 'smtp';
  }
}

export default SMTPProvider;