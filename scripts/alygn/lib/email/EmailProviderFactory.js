/**
 * EmailProviderFactory
 * Creates email provider instances based on type
 * 
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const EMAIL_DIR = path.resolve(ALYGN_DIR, 'lib/email');
const PROVIDERS_DIR = path.resolve(EMAIL_DIR, 'providers');

// Dynamic imports
const SMTPProviderModule = await import(path.join(PROVIDERS_DIR, 'SMTPProvider.js'));
const SmartleadProviderModule = await import(path.join(PROVIDERS_DIR, 'SmartleadProvider.js'));

const { SMTPProvider } = SMTPProviderModule;
const { SmartleadProvider } = SmartleadProviderModule;

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