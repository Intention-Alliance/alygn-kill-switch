/**
 * EmailValidatorFactory
 * Creates email validator instances based on type
 * 
 * Updated: Mar 19, 2026 - Unified code paths with absolute paths
 */
import path from 'path';

// ABSOLUTE PATHS using $HOME
const WORKSPACE_ROOT = path.resolve(process.env.HOME, '.openclaw/workspace');
const ALYGN_DIR = path.resolve(WORKSPACE_ROOT, 'scripts/alygn');
const EMAIL_DIR = path.resolve(ALYGN_DIR, 'lib/email');
const VALIDATORS_DIR = path.resolve(EMAIL_DIR, 'validators');

// Dynamic imports
const RegexMXValidatorModule = await import(path.join(VALIDATORS_DIR, 'RegexMXValidator.js'));
const ZeroBounceValidatorModule = await import(path.join(VALIDATORS_DIR, 'ZeroBounceValidator.js'));

const { RegexMXValidator } = RegexMXValidatorModule;
const { ZeroBounceValidator } = ZeroBounceValidatorModule;

export class EmailValidatorFactory {
  /**
   * Create email validator instance
   * @param {string} type - Validator type ('regex-mx' | 'zerobounce')
   * @param {Object} config - Validator configuration
   * @returns {EmailValidator}
   */
  static create(type, config = {}) {
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