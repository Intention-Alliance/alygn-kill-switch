/**
 * Smartlead Email Provider
 * Sends emails via Smartlead API
 * 
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const EMAIL_DIR = path.resolve(ALYGN_DIR, 'lib/email');
const PROVIDERS_DIR = path.resolve(EMAIL_DIR, 'providers');

// Dynamic import
const EmailProviderModule = await import(path.join(PROVIDERS_DIR, 'EmailProvider.js'));
const { EmailProvider } = EmailProviderModule;

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