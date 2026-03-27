/**
 * Smartlead Email Provider
 * Sends emails via Smartlead API
 */
import { EmailProvider } from './EmailProvider.js';

export class SmartleadProvider extends EmailProvider {
  constructor(config) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.smartlead.ai/v1';
  }

  /**
   * Send email via Smartlead API
   */
  async send(payload) {
    const { to, subject, html, text, from, cc, headers = {} } = payload;

    try {
      const response = await fetch(`${this.baseUrl}/campaigns/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
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

      const data = await response.json();

      return {
        success: true,
        messageId: data.message_id || data.id,
        provider: this.getName(),
        to: to,
        subject: subject,
        campaignId: data.campaign_id
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
   * Validate Smartlead API configuration
   */
  async validateConfig() {
    try {
      const response = await fetch(`${this.baseUrl}/account/verify`, {
        method: 'GET',
        headers: {
          'X-API-Key': this.apiKey
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Smartlead config validation failed:', error.message);
      return false;
    }
  }

  /**
   * Get provider name
   */
  getName() {
    return 'smartlead';
  }
}

export default SmartleadProvider;