/**
 * EmailChannel — Sends critical alerts via email
 *
 * Only dispatches for severity=critical to avoid email spam.
 * Uses existing EmailService for delivery.
 */
import type { AlertChannel, AlertPayload, ChannelResult } from './AlertChannel';

export interface EmailChannelOptions {
  /** EmailService instance (must have sendEmail method) */
  emailService: {
    sendEmail: (payload: {
      to: string;
      subject: string;
      html: string;
      text?: string;
    }) => Promise<{ success: boolean; error?: string; messageId?: string }>;
  };
  /** Recipient email addresses for critical alerts */
  recipients: string[];
  /** From address (optional, uses provider default) */
  from?: string;
}

export class EmailChannel implements AlertChannel {
  readonly name = 'email';
  private readonly emailService: EmailChannelOptions['emailService'];
  private readonly recipients: string[];
  private readonly from: string | undefined;

  constructor(options: EmailChannelOptions) {
    this.emailService = options.emailService;
    this.recipients = options.recipients;
    this.from = options.from;
  }

  async send(alert: AlertPayload): Promise<ChannelResult> {
    // Only send email for critical alerts
    if (alert.severity !== 'critical') {
      return { sent: false, channel: this.name, error: 'Email channel only sends critical alerts' };
    }

    if (this.recipients.length === 0) {
      return { sent: false, channel: this.name, error: 'No recipients configured' };
    }

    const subject = `[ALERT] ${alert.severity.toUpperCase()} — ${alert.service}: ${alert.message.slice(0, 80)}`;
    const html = this.buildHtml(alert);
    const text = this.buildText(alert);

    const errors: string[] = [];
    let sentCount = 0;

    for (const to of this.recipients) {
      try {
        const result = await this.emailService.sendEmail({
          to,
          subject,
          html,
          text,
          ...(this.from ? { from: this.from } : {}),
        });

        if (result.success) {
          sentCount++;
        } else {
          errors.push(`${to}: ${result.error ?? 'unknown error'}`);
        }
      } catch (err) {
        errors.push(`${to}: ${(err as Error).message}`);
      }
    }

    if (sentCount > 0) {
      return {
        sent: true,
        channel: this.name,
        ...(errors.length > 0 ? { error: `Partial failure: ${errors.join('; ')}` } : {}),
      };
    }

    return { sent: false, channel: this.name, error: `All recipients failed: ${errors.join('; ')}` };
  }

  private buildHtml(alert: AlertPayload): string {
    const ts = new Date(alert.timestamp).toISOString();
    const severityColor = alert.severity === 'critical' ? '#ff0000' : '#ffcc00';

    const detailRows = alert.details
      ? Object.entries(alert.details)
          .map(([k, v]) => `<tr><td style="padding:4px 12px;font-weight:bold;">${this.escapeHtml(k)}</td><td style="padding:4px 12px;">${this.escapeHtml(String(v))}</td></tr>`)
          .join('\n')
      : '';

    return `
<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#333;">
  <div style="max-width:600px;margin:0 auto;border:1px solid #ddd;border-radius:8px;overflow:hidden;">
    <div style="background:${severityColor};color:#fff;padding:16px 24px;">
      <h2 style="margin:0;">🚨 CRITICAL Alert</h2>
    </div>
    <div style="padding:16px 24px;">
      <table style="border-collapse:collapse;">
        <tr><td style="padding:4px 12px;font-weight:bold;">Service</td><td style="padding:4px 12px;">${this.escapeHtml(alert.service)}</td></tr>
        <tr><td style="padding:4px 12px;font-weight:bold;">Severity</td><td style="padding:4px 12px;">${alert.severity.toUpperCase()}</td></tr>
        <tr><td style="padding:4px 12px;font-weight:bold;">Time</td><td style="padding:4px 12px;">${ts}</td></tr>
        <tr><td style="padding:4px 12px;font-weight:bold;">Message</td><td style="padding:4px 12px;">${this.escapeHtml(alert.message)}</td></tr>
        ${detailRows}
      </table>
    </div>
  </div>
</body></html>`.trim();
  }

  private buildText(alert: AlertPayload): string {
    const ts = new Date(alert.timestamp).toISOString();
    let text = `[CRITICAL ALERT]\nService: ${alert.service}\nTime: ${ts}\nMessage: ${alert.message}`;
    if (alert.details) {
      text += `\nDetails: ${JSON.stringify(alert.details, null, 2)}`;
    }
    return text;
  }

  private escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}