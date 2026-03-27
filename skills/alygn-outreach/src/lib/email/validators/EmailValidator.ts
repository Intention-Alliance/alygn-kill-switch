/**
 * EmailValidator Interface
 * Abstract base class for email validators
 */
export interface IEmailValidationResult {
  result: 'valid' | 'invalid' | 'risky' | 'unknown';
  confidence: number;
  details: {
    reason?: string;
    message?: string;
    error?: string;
    domain?: string;
    prefix?: string;
    format?: string;
    [key: string]: unknown;
  };
  validator: string;
  raw?: Record<string, unknown>;
}

export abstract class EmailValidator {
  protected config: Record<string, unknown>;

  constructor(config: Record<string, unknown> = {}) {
    this.config = config;
  }

  /**
   * Validate an email address
   */
  abstract validate(email: string): Promise<IEmailValidationResult>;

  /**
   * Get validator name
   */
  abstract getName(): string;
}

export default EmailValidator;
