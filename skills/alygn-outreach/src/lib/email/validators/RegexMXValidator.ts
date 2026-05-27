/**
 * RegexMXValidator
 * Validates emails using regex AND actual DNS MX record checks.
 * Uses Node.js dns.promises.resolveMx() for real MX lookups.
 * Detects LLM-hallucinated email patterns (truncated names, underscorified initials).
 */
import dns from 'dns/promises';
import { EmailValidator, type IEmailValidationResult } from './EmailValidator';

interface RegexMXConfig {
  checkDisposable?: boolean;
  checkRoleBased?: boolean;
  checkMX?: boolean;
  [key: string]: unknown;
}

// Generic team prefixes that pass MX but likely won't reach a partner
const GENERIC_PREFIXES = [
  'hello', 'info', 'contact', 'team', 'admin', 'support',
  'sales', 'marketing', 'help', 'webmaster', 'postmaster',
  'ventures', 'invest', 'pitch', 'partners', 'founders'
];

// Patterns strongly associated with LLM-generated fake emails
const HALLUCINATION_PATTERNS = [
  /^[a-z]_[a-z]@/,         // j_b@, k_p@ — underscore-delimited initials
  /^[a-z]{3,4}@[a-z]+\./,  // arj@, just@ — first name truncation
  /^[a-z]@/,               // single letter prefix (unlikely real)
];

export class RegexMXValidator extends EmailValidator {
  constructor(config: RegexMXConfig = {}) {
    super(config);
  }

  private async checkMXRecord(domain: string): Promise<boolean> {
    try {
      const addresses = await dns.resolveMx(domain);
      return addresses && addresses.length > 0;
    } catch {
      return false;
    }
  }

  private looksLikeHallucination(email: string): boolean {
    for (const pattern of HALLUCINATION_PATTERNS) {
      if (pattern.test(email)) return true;
    }
    return false;
  }

  async validate(email: string): Promise<IEmailValidationResult> {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return {
        result: 'invalid', confidence: 1.0,
        details: { reason: 'Invalid email format' },
        validator: this.getName()
      };
    }

    const domain = email.split('@')[1];
    const prefix = email.split('@')[0].toLowerCase();

    // Hallucination detection — LLMs generate these patterns
    if (this.looksLikeHallucination(email)) {
      return {
        result: 'invalid', confidence: 0.95,
        details: {
          reason: 'Pattern matches LLM hallucination (truncated name, initial underscore, etc.)',
          domain, prefix
        },
        validator: this.getName()
      };
    }

    // Real MX record check (default: ON)
    const cfg = this.config as RegexMXConfig;
    if (cfg.checkMX !== false) {
      const hasMX = await this.checkMXRecord(domain);
      if (!hasMX) {
        return {
          result: 'invalid', confidence: 1.0,
          details: {
            reason: `Domain ${domain} has no MX records — cannot receive mail`,
            domain
          },
          validator: this.getName()
        };
      }
    }

    // Disposable domains
    if (cfg.checkDisposable !== false) {
      const disposableDomains = [
        'tempmail.com', 'throwaway.com', 'mailinator.com',
        'guerrillamail.com', '10minutemail.com', 'maildrop.cc',
        'trashmail.com', 'sharklasers.com', 'yopmail.com'
      ];
      if (disposableDomains.includes(domain.toLowerCase())) {
        return {
          result: 'risky', confidence: 0.9,
          details: { reason: 'Disposable email domain', domain },
          validator: this.getName()
        };
      }
    }

    // Role-based emails
    if (cfg.checkRoleBased !== false) {
      const roleBasedPrefixes = [
        'admin', 'support', 'info', 'contact', 'sales',
        'marketing', 'help', 'webmaster', 'postmaster'
      ];
      if (roleBasedPrefixes.some(role => prefix.includes(role))) {
        return {
          result: 'risky', confidence: 0.7,
          details: { reason: 'Role-based email', prefix },
          validator: this.getName()
        };
      }
    }

    // Flag generic VC prefixes (team inboxes, not partner addresses)
    if (GENERIC_PREFIXES.includes(prefix)) {
      return {
        result: 'risky', confidence: 0.75,
        details: {
          reason: 'Generic prefix — likely a team inbox, not a direct partner email',
          prefix, domain
        },
        validator: this.getName()
      };
    }

    return {
      result: 'valid', confidence: 0.85,
      details: { domain, format: 'valid', mxChecked: cfg.checkMX !== false },
      validator: this.getName()
    };
  }

  getName(): string { return 'regex-mx'; }
}

export default RegexMXValidator;
