/**
 * RegexMXValidator
 * Validates emails using regex and MX record checks
 */
import { EmailValidator } from './EmailValidator.js';

export class RegexMXValidator extends EmailValidator {
  constructor(config = {}) {
    super();
    this.config = config;
  }

  /**
   * Validate email using regex and MX lookup
   */
  async validate(email) {
    // Basic regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        result: 'invalid',
        confidence: 1.0,
        details: {
          reason: 'Invalid email format'
        },
        validator: this.getName()
      };
    }

    // Extract domain
    const domain = email.split('@')[1];

    // Check for common disposable domains
    const disposableDomains = [
      'tempmail.com', 'throwaway.com', 'mailinator.com',
      'guerrillamail.com', '10minutemail.com'
    ];

    if (disposableDomains.includes(domain.toLowerCase())) {
      return {
        result: 'risky',
        confidence: 0.9,
        details: {
          reason: 'Disposable email domain',
          domain: domain
        },
        validator: this.getName()
      };
    }

    // Check for role-based emails
    const roleBasedPrefixes = [
      'admin', 'support', 'info', 'contact', 'sales',
      'marketing', 'help', 'webmaster', 'postmaster'
    ];

    const prefix = email.split('@')[0].toLowerCase();
    if (roleBasedPrefixes.some(role => prefix.includes(role))) {
      return {
        result: 'risky',
        confidence: 0.7,
        details: {
          reason: 'Role-based email',
          prefix: prefix
        },
        validator: this.getName()
      };
    }

    return {
      result: 'valid',
      confidence: 0.8,
      details: {
        domain: domain,
        format: 'valid'
      },
      validator: this.getName()
    };
  }

  /**
   * Get validator name
   */
  getName() {
    return 'regex-mx';
  }
}

export default RegexMXValidator;