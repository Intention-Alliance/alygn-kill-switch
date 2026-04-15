/**
 * DiscordChannel — Sends alerts to Discord via webhook
 *
 * Features:
 *  - Configurable webhook URL per severity level
 *  - Rate limit: max 5 alerts per minute
 *  - Embed formatting with color coding
 *  - Fallback to console if webhook fails
 */
import type { AlertChannel, AlertPayload, ChannelResult } from './AlertChannel';

export interface DiscordChannelOptions {
  /** Webhook URLs per severity. Falls back to 'default' if severity not mapped. */
  webhooks: {
    critical?: string;
    warning?: string;
    info?: string;
    default?: string;
  };
  /** Max alerts per minute before rate-limiting (default: 5) */
  rateLimitPerMinute?: number;
}

const SEVERITY_COLORS: Record<AlertPayload['severity'], number> = {
  critical: 0xff0000,  // red
  warning: 0xffff00,   // yellow
  info: 0x3498db,      // blue
};

export class DiscordChannel implements AlertChannel {
  readonly name = 'discord';
  private readonly webhooks: DiscordChannelOptions['webhooks'];
  private readonly rateLimitPerMinute: number;
  private readonly sentTimestamps: number[] = [];

  constructor(options: DiscordChannelOptions) {
    this.webhooks = options.webhooks;
    this.rateLimitPerMinute = options.rateLimitPerMinute ?? 5;
  }

  async send(alert: AlertPayload): Promise<ChannelResult> {
    const webhookUrl = this.getWebhookUrl(alert.severity);

    if (!webhookUrl) {
      return { sent: false, channel: this.name, error: 'No webhook URL configured for severity ' + alert.severity };
    }

    // Rate limit check
    if (this.isRateLimited()) {
      console.warn(`[DiscordChannel] Rate limited — dropping alert: ${alert.message}`);
      return { sent: false, channel: this.name, error: 'Rate limited' };
    }

    try {
      const payload = this.buildPayload(alert);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => 'unknown error');
        console.error(`[DiscordChannel] Webhook failed (${response.status}): ${text}`);
        return { sent: false, channel: this.name, error: `HTTP ${response.status}: ${text}` };
      }

      this.recordSend();
      return { sent: true, channel: this.name };
    } catch (err) {
      console.error(`[DiscordChannel] Send failed: ${(err as Error).message}`);
      return { sent: false, channel: this.name, error: (err as Error).message };
    }
  }

  private getWebhookUrl(severity: AlertPayload['severity']): string | undefined {
    return this.webhooks[severity] ?? this.webhooks.default;
  }

  private isRateLimited(): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;
    // Prune old entries
    while (this.sentTimestamps.length > 0 && this.sentTimestamps[0] < windowStart) {
      this.sentTimestamps.shift();
    }
    return this.sentTimestamps.length >= this.rateLimitPerMinute;
  }

  private recordSend(): void {
    this.sentTimestamps.push(Date.now());
  }

  private buildPayload(alert: AlertPayload): Record<string, unknown> {
    const ts = new Date(alert.timestamp).toISOString();
    const color = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.info;

    return {
      embeds: [
        {
          title: `🚨 ${alert.severity.toUpperCase()} Alert`,
          color,
          fields: [
            { name: 'Service', value: alert.service, inline: true },
            { name: 'Severity', value: alert.severity.toUpperCase(), inline: true },
            { name: 'Time', value: ts, inline: true },
            { name: 'Message', value: alert.message, inline: false },
          ],
          ...(alert.details
            ? {
                footer: { text: `Details: ${Object.keys(alert.details).join(', ')}` },
              }
            : {}),
          timestamp: ts,
        },
      ],
    };
  }
}