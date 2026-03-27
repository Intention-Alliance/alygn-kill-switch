/**
 * SMTP Email Provider
 * Sends emails via SMTP using nodemailer
 */
import type { EmailProvider, IEmailPayload, ISendResult } from './EmailProvider';

interface SMTPConfig {
  server?: string;
  port?: number;
  user?: string;
  password?: string;
  secure?: boolean;
  [key: string]: unknown;
}

// Use dynamic import for nodemailer to handle bundling
let nodemailer: typeof import('nodemailer') | null = null;

async function getNodemailer(): Promise<typeof import('nodemailer')> {
  if (!nodemailer) {
    nodemailer = await import('nodemailer');
  }
  return nodemailer;
}

export class SMTPProvider extends EmailProvider {
  private transporter: Awaited<ReturnType<typeof import('nodemailer')['createTransport']>> | null = null;

  constructor(config: SMTPConfig = {}) {
    super();
    this.config = config;
  }

  /**
   * Initialize SMTP transporter
   */
  async initialize(): Promise<void> {
    if (this.transporter) return;

    const config = this.config as SMTPConfig;
    const { server, port, user, password, secure = false } = config;
    
    const nm = await getNodemailer();
    this.transporter = nm.createTransport({
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
  async send(payload: IEmailPayload): Promise<ISendResult> {
    await this.initialize();

    const { to, subject, html, text, from, cc, headers = {} } = payload;

    try {
      const nm = await getNodemailer();
      const mailOptions: Parameters<typeof nm.createTransport>[0] = {
        from: from || `Alygn R&D <${(this.config as SMTPConfig).user}>`,
        to: to,
        subject: subject,
        text: text || (html ? html.replace(/<[^>]*>/g, '') : undefined),
        html: html,
        headers: headers
      };

      if (cc) {
        mailOptions.cc = Array.isArray(cc) ? cc.join(', ') : cc;
      }

      const info = await this.transporter!.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
        provider: this.getName(),
        to: to,
        subject: subject,
        cc: cc ? (Array.isArray(cc) ? cc[0] : cc) : null
      };
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        error: err.message,
        provider: this.getName(),
        to: to,
        subject: subject
      };
    }
  }

  /**
   * Validate SMTP configuration
   */
  async validateConfig(): Promise<boolean> {
    try {
      await this.initialize();
      const verified = await this.transporter!.verify();
      return verified === true;
    } catch (error) {
      const err = error as Error;
      console.error('SMTP config validation failed:', err.message);
      return false;
    }
  }

  /**
   * Get provider name
   */
  getName(): string {
    return 'smtp';
  }
}

export default SMTPProvider;
