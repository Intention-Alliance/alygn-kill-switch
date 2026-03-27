/**
 * Smartlead Email Provider
 * Sends emails via Smartlead API
 */
import { EmailProvider, type IEmailPayload, type ISendResult } from './EmailProvider';

interface SmartleadConfig {
  apiKey?: string;
  baseUrl?: string;
  [key: string]: unknown;
}

export class SmartleadProvider extends EmailProvider {
  constructor(config: SmartleadConfig = {}) {
    super();
    this.config = config;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.smartlead.ai/v1';
  }

  /**
   * Send email via Smartlead API
   */
  async send(payload: IEmailPayload): Promise<ISendResult> {
    const { to, subject, html, text, from, cc, headers = {} } = payload;

    try {
      const response = await fetch(`${this.baseUrl}/campaigns/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey!
        },
        body: JSON.stringify({
          to: to,
          from: from || 'Alygn R&D <outreach@alyygn.com>',
          subject: subject,
          body: html || text,
          html_body: html,
          text_body: text,
          cc: cc,
          custom_headers: headers
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Smartlead API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json() as { message_id?: string; id?: string; campaign_id?: string };

      return {
        success: true,
        messageId: data.message_id || data.id,
        provider: this.getName(),
        to: to,
        subject: subject,
        campaignId: data.campaign_id
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
   * Validate Smartlead API configuration
   */
  async validateConfig(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/account/verify`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey!
        }
      });

      return response.ok;
    } catch (error) {
      const err = error as Error;
      console.error('Smartlead config validation failed:', err.message);
      return false;
    }
  }

  /**
   * Get provider name
   */
  getName(): string {
    return 'smartlead';
  }
}

export default SmartleadProvider;
