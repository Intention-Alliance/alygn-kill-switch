/**
 * EmailProvider Interface
 * Base class for all email providers
 */
export class EmailProvider {
  /**
   * Send an email
   * @param {Object} payload - Email payload
   * @param {string} payload.to - Recipient email
   * @param {string} payload.subject - Email subject
   * @param {string} payload.html - HTML body
   * @param {string} [payload.text] - Plain text body
   * @param {string} [payload.from] - Sender address
   * @param {string} [payload.cc] - CC recipients
   * @param {Object} [payload.headers] - Additional headers
   * @returns {Promise<Object>} - { success, messageId, error }
   */
  async send(payload) {
    throw new Error('Not implemented');
  }

  /**
   * Validate provider configuration
   * @returns {Promise<boolean>}
   */
  async validateConfig() {
    throw new Error('Not implemented');
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    throw new Error('Not implemented');
  }
}
