/**
 * EmailValidator Interface
 * Base class for email validators
 */
export class EmailValidator {
  /**
   * Validate an email address
   * @param {string} email - Email to validate
   * @returns {Promise<Object>} - { result: 'valid'|'invalid'|'risky'|'unknown', details: {}, confidence: number }
   */
  async validate(email) {
    throw new Error('Not implemented');
  }

  /**
   * Get validator name
   * @returns {string}
   */
  getName() {
    throw new Error('Not implemented');
  }
}
