/**
 * EmailProviderFactory
 * Creates email provider instances based on type
 */
import { SMTPProvider } from './providers/SMTPProvider.js';
import { SmartleadProvider } from './providers/SmartleadProvider.js';

export class EmailProviderFactory {
  /**
   * Create email provider instance
   * @param {string} type - Provider type ('smtp' | 'smartlead')
   * @param {Object} config - Provider configuration
   * @returns {EmailProvider}
   */
  static create(type, config) {
    switch (type.toLowerCase()) {
      case 'smtp':
        return new SMTPProvider(config);
      case 'smartlead':
        return new SmartleadProvider(config);
      default:
        throw new Error(`Unknown email provider type: ${type}`);
    }
  }

  /**
   * Get available provider types
   * @returns {string[]}
   */
  static getAvailableTypes() {
    return ['smtp', 'smartlead'];
  }
}

export default EmailProviderFactory;