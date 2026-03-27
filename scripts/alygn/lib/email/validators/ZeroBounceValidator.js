/**
 * ZeroBounceValidator
 * Validates emails using ZeroBounce API
 * https://www.zerobounce.net/
 * 
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const EMAIL_DIR = path.resolve(ALYGN_DIR, 'lib/email');
const VALIDATORS_DIR = path.resolve(EMAIL_DIR, 'validators');

// Dynamic import
const EmailValidatorModule = await import(path.join(VALIDATORS_DIR, 'EmailValidator.js'));
const { EmailValidator } = EmailValidatorModule;

export class ZeroBounceValidator extends EmailValidator {
  constructor(config) {
    super();
    this.apiKey = config.apiKey;
    this.baseUrl = 'https://api.zerobounce.net/v2';
  }

  /**
   * Validate email via ZeroBounce API
   */
  async validate(email) {
    try {
      const response = await fetch(
        `${this.baseUrl}/validate?api_key=${this.apiKey}&email=${encodeURIComponent(email)}&ip_address=`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`ZeroBounce API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        result: this.mapStatus(data.status),
        confidence: data.confidence_score ? data.confidence_score / 100 : 0.8,
        details: {
          catchAll: data.catch_all === 'true',
          disposable: data.disposable === 'true',
          roleBased: data.role_based === 'true',
          freeDomain: data.free_domain === 'true',
          didYouMean: data.did_you_mean || null,
          processedAt: data.processed_at,
          rawStatus: data.status
        },
        validator: this.getName(),
        raw: data
      };
    } catch (error) {
      return {
        result: 'unknown',
        confidence: 0,
        details: {
          error: error.message
        },
        validator: this.getName()
      };
    }
  }

  /**
   * Map ZeroBounce status to our standard results
   * @param {string} zbStatus - ZeroBounce status
   * @returns {string} - 'valid' | 'invalid' | 'risky' | 'unknown'
   */
  mapStatus(zbStatus) {
    const mapping = {
      'valid': 'valid',
      'invalid': 'invalid',
      'catch-all': 'risky',
      'unknown': 'unknown',
      'spamtrap': 'invalid',
      'abuse': 'invalid',
      'do_not_mail': 'invalid'
    };

    return mapping[zbStatus] || 'unknown';
  }

  /**
   * Get validator name
   */
  getName() {
    return 'zerobounce';
  }
}

export default ZeroBounceValidator;