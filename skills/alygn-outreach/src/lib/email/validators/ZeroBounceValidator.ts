/**
 * ZeroBounceValidator
 * Validates emails using ZeroBounce API
 * https://www.zerobounce.net/
 */
import { EmailValidator, type IEmailValidationResult } from './EmailValidator';

interface ZeroBounceConfig {
  apiKey?: string;
  [key: string]: unknown;
}

interface ZeroBounceResponse {
  status: string;
  confidence_score?: number;
  catch_all?: string;
  disposable?: string;
  role_based?: string;
  free_domain?: string;
  did_you_mean?: string;
  processed_at?: string;
}

export class ZeroBounceValidator extends EmailValidator {
  private apiKey: string;
  
  constructor(config: ZeroBounceConfig) {
    super(config);
    this.apiKey = config.apiKey || '';
  }

  /**
   * Validate email via ZeroBounce API
   */
  async validate(email: string): Promise<IEmailValidationResult> {
    const baseUrl = 'https://api.zerobounce.net/v2';
    
    try {
      const response = await fetch(
        `${baseUrl}/validate?api_key=${this.apiKey}&email=${encodeURIComponent(email)}&ip_address=`,
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

      const data = await response.json() as ZeroBounceResponse;

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
        raw: data as Record<string, unknown>
      };
    } catch (error) {
      const err = error as Error;
      return {
        result: 'unknown',
        confidence: 0,
        details: {
          error: err.message
        },
        validator: this.getName()
      };
    }
  }

  /**
   * Map ZeroBounce status to our standard results
   */
  private mapStatus(zbStatus: string): 'valid' | 'invalid' | 'risky' | 'unknown' {
    const mapping: Record<string, 'valid' | 'invalid' | 'risky' | 'unknown'> = {
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
  getName(): string {
    return 'zerobounce';
  }
}

export default ZeroBounceValidator;
