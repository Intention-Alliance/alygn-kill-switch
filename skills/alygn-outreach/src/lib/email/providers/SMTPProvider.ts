/**
 * SMTP Email Provider
 * Sends emails via SMTP using nodemailer
 */
import nodemailer from 'nodemailer';
import { EmailProvider } from './EmailProvider.js';

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