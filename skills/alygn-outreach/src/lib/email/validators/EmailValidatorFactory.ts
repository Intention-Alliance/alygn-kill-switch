/**
 * EmailValidatorFactory
 * Creates email validator instances based on type
 */
import { RegexMXValidator } from './RegexMXValidator.js';
import { ZeroBounceValidator } from './ZeroBounceValidator.js';

export class EmailValidatorFactory {
  /**
   * Create email validator instance
   * @param {string} type - Validator type ('regex-mx' | 'zerobounce')
   * @param {Object} config - Validator configuration
   * @returns {EmailValidator}
   */
  static create(type: string, config: Record<string, unknown> = {}) {
    switch (type.toLowerCase()) {
      case 'regex-mx':
        return new RegexMXValidator(config);
      case 'zerobounce':
        return new ZeroBounceValidator(config);
      default:
        throw new Error(`Unknown email validator type: ${type}`);
    }
  }

  /**
   * Get available validator types
   * @returns {string[]}
   */
  static getAvailableTypes() {
    return ['regex-mx', 'zerobounce'];
  }
}

export default EmailValidatorFactory;
