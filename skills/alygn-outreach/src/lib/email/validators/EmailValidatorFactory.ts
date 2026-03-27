/**
 * EmailValidatorFactory
 * Creates email validator instances based on type
 */
import type { EmailValidator } from './EmailValidator';
import { RegexMXValidator } from './RegexMXValidator';
import { ZeroBounceValidator } from './ZeroBounceValidator';

export class EmailValidatorFactory {
  /**
   * Create email validator instance
   */
  static create(type: string, config: Record<string, unknown> = {}): EmailValidator {
    switch (type.toLowerCase()) {
      case 'regex-mx':
        return new RegexMXValidator(config);
      case 'zerobounce':
        return new ZeroBounceValidator(config as { apiKey: string });
      default:
        throw new Error(`Unknown email validator type: ${type}`);
    }
  }

  /**
   * Get available validator types
   */
  static getAvailableTypes(): string[] {
    return ['regex-mx', 'zerobounce'];
  }
}

export default EmailValidatorFactory;
