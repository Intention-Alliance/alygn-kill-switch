/**
 * DataClassifier — H-104
 *
 * Classifies data by sensitivity level (public / internal / confidential /
 * restricted) using regex-based pattern matching for PII, financial data,
 * and credentials.
 *
 * API:
 *   DataClassifier.classify(data) → ClassificationResult
 *   DataClassifier.getHandlingPolicy(level) → DataHandlingPolicy
 *   DataClassifier.enforceClassification(data, context) → EnforcedResult
 *
 * Integrates with PolicyEnforcer so that classification results feed into
 * policy decisions (e.g. restricted data requires explicit approval).
 *
 * No external dependencies — pure TypeScript, strict-mode compatible.
 */

import type { PolicyEnforcer } from './PolicyEnforcer';
import type { PolicyContext } from './SecurityPolicy';

// ── Sensitivity levels ────────────────────────────────────────────────

export type SensitivityLevel = 'public' | 'internal' | 'confidential' | 'restricted';

export const SENSITIVITY_ORDER: Record<SensitivityLevel, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

// ── Classification rule types ─────────────────────────────────────────

export type DataCategory =
  | 'pii-email'
  | 'pii-phone'
  | 'pii-ssn'
  | 'pii-credit-card'
  | 'financial'
  | 'credential'
  | 'personal-name'
  | 'health'
  | 'custom';

export interface ClassificationRule {
  /** Unique identifier for the rule */
  id: string;
  /** Human-readable label */
  label: string;
  /** Data category this rule detects */
  category: DataCategory;
  /** Regex pattern to match against string values */
  pattern: RegExp;
  /** Sensitivity level assigned when this rule matches */
  level: SensitivityLevel;
  /** Whether a match should block the action (true) or just flag it */
  block: boolean;
  /** Optional description for audit logs */
  description?: string;
}

// ── Result types ──────────────────────────────────────────────────────

export interface FieldClassification {
  /** Dot-path to the field in the input data (e.g. "user.email") */
  fieldPath: string;
  /** The rule that matched */
  ruleId: string;
  /** Category of the matched data */
  category: DataCategory;
  /** Sensitivity level assigned */
  level: SensitivityLevel;
  /** Whether this match blocks the action */
  block: boolean;
  /** The portion of the value that matched (truncated for safety) */
  matchPreview: string;
}

export interface ClassificationResult {
  /** Highest sensitivity level across all matched fields */
  level: SensitivityLevel;
  /** All rules that matched at least one field */
  matchedRules: ClassificationRule[];
  /** Per-field classification details */
  fieldClassifications: FieldClassification[];
  /** Whether any blocking rule matched */
  blocked: boolean;
  /** Summary reason string */
  reason: string;
}

// ── Data handling policy ──────────────────────────────────────────────

export interface DataHandlingPolicy {
  /** Sensitivity level this policy applies to */
  level: SensitivityLevel;
  /** Whether data at this level must be encrypted at rest */
  encryptionAtRest: boolean;
  /** Whether data at this level must be encrypted in transit */
  encryptionInTransit: boolean;
  /** Minimum access level required (e.g. "admin", "team", "any") */
  accessLevel: string;
  /** Whether all access must be audit-logged */
  auditRequired: boolean;
  /** Data retention period in days (0 = indefinite) */
  retentionDays: number;
  /** Whether data can be shared externally */
  externalSharingAllowed: boolean;
  /** Whether data can be logged in plain text */
  plainTextLoggingAllowed: boolean;
  /** Additional notes */
  notes?: string;
}

// ── Default classification rules ───────────────────────────────────────

export const DEFAULT_CLASSIFICATION_RULES: ClassificationRule[] = [
  // ── PII: Email ────────────────────────────────────────────────
  {
    id: 'pii-email',
    label: 'Email Address',
    category: 'pii-email',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    level: 'confidential',
    block: false,
    description: 'Detects email addresses which are PII',
  },
  // ── PII: Phone ───────────────────────────────────────────────
  {
    id: 'pii-phone',
    label: 'Phone Number',
    category: 'pii-phone',
    pattern: /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/,
    level: 'confidential',
    block: false,
    description: 'Detects phone numbers in various formats',
  },
  // ── PII: SSN ─────────────────────────────────────────────────
  {
    id: 'pii-ssn',
    label: 'Social Security Number',
    category: 'pii-ssn',
    pattern: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/,
    level: 'restricted',
    block: true,
    description: 'SSN pattern — always restricted, blocks by default',
  },
  // ── PII: Credit Card ─────────────────────────────────────────
  {
    id: 'pii-credit-card',
    label: 'Credit Card Number',
    category: 'pii-credit-card',
    pattern: /\b(?:\d[ -]*?){13,19}\b/,
    level: 'restricted',
    block: true,
    description: 'Credit card number pattern — always restricted',
  },
  // ── Financial ────────────────────────────────────────────────
  {
    id: 'financial-iban',
    label: 'IBAN',
    category: 'financial',
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/,
    level: 'restricted',
    block: true,
    description: 'International Bank Account Number',
  },
  {
    id: 'financial-account',
    label: 'Bank Account Number',
    category: 'financial',
    pattern: /(?:account|acct|bank|iban|routing)\s*#?\s*\d{8,17}\b|\b\d{8,17}\b\s*(?:account|acct)/i,
    level: 'confidential',
    block: false,
    description: 'Bank account number pattern (8-17 digits) with adjacent bank-related context',
  },
  // ── Credentials ──────────────────────────────────────────────
  {
    id: 'credential-password',
    label: 'Password in Content',
    category: 'credential',
    pattern: /(?:password|passwd|pwd|contraseña|clave)\s*[:=]\s*\S+/i,
    level: 'restricted',
    block: true,
    description: 'Password exposed in plain text',
  },
  {
    id: 'credential-api-key',
    label: 'API Key / Secret',
    category: 'credential',
    pattern: /(?:api[_-]?key|secret[_-]?key|access[_-]?token|private[_-]?key)\s*[:=]\s*\S+/i,
    level: 'restricted',
    block: true,
    description: 'API key or secret exposed in plain text',
  },
  {
    id: 'credential-bearer',
    label: 'Bearer Token',
    category: 'credential',
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i,
    level: 'restricted',
    block: true,
    description: 'Bearer token in content',
  },
  // ── Health ───────────────────────────────────────────────────
  {
    id: 'health-record',
    label: 'Health Data',
    category: 'health',
    pattern: /(?:diagnosis|medical|prescription|patient[_-]?id|health[_-]?record)\s*[:=]/i,
    level: 'restricted',
    block: true,
    description: 'Health-related data reference',
  },
  // ── Personal Name (lower sensitivity) ────────────────────────
  {
    id: 'personal-name',
    label: 'Personal Name Field',
    category: 'personal-name',
    pattern: /(?:full[_-]?name|first[_-]?name|last[_-]?name)\s*[:=]/i,
    level: 'internal',
    block: false,
    description: 'Personal name field reference (lower sensitivity)',
  },
];

// ── Default handling policies ──────────────────────────────────────────

export const DEFAULT_HANDLING_POLICIES: Record<SensitivityLevel, DataHandlingPolicy> = {
  public: {
    level: 'public',
    encryptionAtRest: false,
    encryptionInTransit: false,
    accessLevel: 'any',
    auditRequired: false,
    retentionDays: 0,
    externalSharingAllowed: true,
    plainTextLoggingAllowed: true,
    notes: 'Public data — no special handling required',
  },
  internal: {
    level: 'internal',
    encryptionAtRest: false,
    encryptionInTransit: true,
    accessLevel: 'team',
    auditRequired: false,
    retentionDays: 365,
    externalSharingAllowed: false,
    plainTextLoggingAllowed: true,
    notes: 'Internal data — encrypt in transit, team-only access',
  },
  confidential: {
    level: 'confidential',
    encryptionAtRest: true,
    encryptionInTransit: true,
    accessLevel: 'admin',
    auditRequired: true,
    retentionDays: 90,
    externalSharingAllowed: false,
    plainTextLoggingAllowed: false,
    notes: 'Confidential data — encrypt at rest and in transit, admin access, audit all access',
  },
  restricted: {
    level: 'restricted',
    encryptionAtRest: true,
    encryptionInTransit: true,
    accessLevel: 'admin',
    auditRequired: true,
    retentionDays: 30,
    externalSharingAllowed: false,
    plainTextLoggingAllowed: false,
    notes: 'Restricted data — maximum protection, minimal retention, strict access',
  },
};

// ── Options ────────────────────────────────────────────────────────────

export interface DataClassifierOptions {
  /** Custom classification rules (merged with defaults; same id overrides) */
  rules?: ClassificationRule[];
  /** Custom handling policies (merged with defaults; same level overrides) */
  handlingPolicies?: Partial<Record<SensitivityLevel, Partial<DataHandlingPolicy>>>;
  /** PolicyEnforcer for integration (optional) */
  policyEnforcer?: PolicyEnforcer;
  /** Maximum preview length for matched values (default 20) */
  maxPreviewLength?: number;
}

// ── Implementation ────────────────────────────────────────────────────

export class DataClassifier {
  private readonly rules: ClassificationRule[];
  private readonly handlingPolicies: Record<SensitivityLevel, DataHandlingPolicy>;
  private readonly policyEnforcer: PolicyEnforcer | null;
  private readonly maxPreviewLength: number;

  constructor(opts: DataClassifierOptions = {}) {
    // Merge custom rules with defaults (custom overrides by id)
    const customRuleMap = new Map<string, ClassificationRule>();
    for (const rule of (opts.rules ?? [])) {
      customRuleMap.set(rule.id, rule);
    }
    this.rules = DEFAULT_CLASSIFICATION_RULES.map(
      (defaultRule) => customRuleMap.get(defaultRule.id) ?? defaultRule,
    );
    // Append any custom rules that don't override a default
    for (const [id, rule] of customRuleMap) {
      if (!DEFAULT_CLASSIFICATION_RULES.some((d) => d.id === id)) {
        this.rules.push(rule);
      }
    }

    // Merge handling policies
    this.handlingPolicies = { ...DEFAULT_HANDLING_POLICIES };
    if (opts.handlingPolicies) {
      for (const [level, partial] of Object.entries(opts.handlingPolicies)) {
        if (partial && level in this.handlingPolicies) {
          this.handlingPolicies[level as SensitivityLevel] = {
            ...this.handlingPolicies[level as SensitivityLevel],
            ...partial,
          };
        }
      }
    }

    this.policyEnforcer = opts.policyEnforcer ?? null;
    this.maxPreviewLength = opts.maxPreviewLength ?? 20;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Classify an arbitrary data object by scanning all string values
   * against classification rules.
   *
   * @param data - The data to classify (object, array, or primitive)
   * @returns ClassificationResult with the highest sensitivity level found
   */
  classify(data: unknown): ClassificationResult {
    const fieldClassifications: FieldClassification[] = [];
    const matchedRuleIds = new Set<string>();

    this.scanValue(data, '', fieldClassifications, matchedRuleIds);

    // Determine highest sensitivity level
    let highestLevel: SensitivityLevel = 'public';
    let blocked = false;

    for (const fc of fieldClassifications) {
      if (SENSITIVITY_ORDER[fc.level] > SENSITIVITY_ORDER[highestLevel]) {
        highestLevel = fc.level;
      }
      if (fc.block) {
        blocked = true;
      }
    }

    // Collect unique matched rules
    const matchedRules = this.rules.filter((r) => matchedRuleIds.has(r.id));

    const reason = this.buildReason(highestLevel, matchedRules, fieldClassifications);

    return {
      level: highestLevel,
      matchedRules,
      fieldClassifications,
      blocked,
      reason,
    };
  }

  /**
   * Get the handling policy for a given sensitivity level.
   */
  getHandlingPolicy(level: SensitivityLevel): DataHandlingPolicy {
    return this.handlingPolicies[level];
  }

  /**
   * Get all handling policies.
   */
  getAllHandlingPolicies(): Record<SensitivityLevel, DataHandlingPolicy> {
    return { ...this.handlingPolicies };
  }

  /**
   * Classify data and enforce policy via PolicyEnforcer integration.
   *
   * If the classification result is "restricted" or "blocked", the
   * PolicyEnforcer is invoked with a "data.classification" action context
   * so that the decision is audit-logged and can be denied.
   *
   * Without a PolicyEnforcer, returns the classification result directly
   * with `enforced: false`.
   */
  async enforceClassification(
    data: unknown,
    context?: Partial<PolicyContext>,
  ): Promise<ClassificationEnforcementResult> {
    const result = this.classify(data);

    if (!this.policyEnforcer) {
      return {
        classification: result,
        allowed: !result.blocked,
        enforced: false,
        policyResult: null,
      };
    }

    // Build a policy context from the classification result
    const policyContext: PolicyContext = {
      ...context,
      metadata: {
        ...(context?.metadata ?? {}),
        classificationLevel: result.level,
        classificationBlocked: result.blocked,
        matchedRuleCount: result.matchedRules.length,
        fieldClassificationCount: result.fieldClassifications.length,
      },
    };

    // For restricted or blocked data, enforce via PolicyEnforcer
    if (result.level === 'restricted' || result.blocked) {
      const enforced = await this.policyEnforcer.enforce('api.write', policyContext);
      return {
        classification: result,
        allowed: enforced.allowed && !result.blocked,
        enforced: true,
        policyResult: enforced,
      };
    }

    // For confidential data, conditional enforcement
    if (result.level === 'confidential') {
      const enforced = await this.policyEnforcer.enforce('api.general', policyContext);
      return {
        classification: result,
        allowed: enforced.allowed,
        enforced: true,
        policyResult: enforced,
      };
    }

    // Public / internal — allowed by default
    return {
      classification: result,
      allowed: true,
      enforced: true,
      policyResult: null,
    };
  }

  /**
   * Get all configured rules (read-only copy).
   */
  getRules(): ReadonlyArray<Readonly<ClassificationRule>> {
    return [...this.rules];
  }

  // ── Private: recursive value scanner ────────────────────────────

  private scanValue(
    value: unknown,
    path: string,
    results: FieldClassification[],
    matchedRuleIds: Set<string>,
  ): void {
    if (value == null || typeof value === 'boolean' || typeof value === 'number') {
      return;
    }

    if (typeof value === 'string') {
      this.scanString(value, path, results, matchedRuleIds);
      return;
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        this.scanValue(value[i], path ? `${path}[${i}]` : `[${i}]`, results, matchedRuleIds);
      }
      return;
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const key of Object.keys(obj)) {
        const childPath = path ? `${path}.${key}` : key;
        this.scanValue(obj[key], childPath, results, matchedRuleIds);
      }
    }
  }

  private scanString(
    value: string,
    path: string,
    results: FieldClassification[],
    matchedRuleIds: Set<string>,
  ): void {
    for (const rule of this.rules) {
      const match = rule.pattern.exec(value);
      if (match) {
        matchedRuleIds.add(rule.id);
        results.push({
          fieldPath: path || '(root)',
          ruleId: rule.id,
          category: rule.category,
          level: rule.level,
          block: rule.block,
          matchPreview: this.truncatePreview(match[0]),
        });
      }
    }
  }

  private truncatePreview(match: string): string {
    if (match.length <= this.maxPreviewLength) return match;
    return match.slice(0, this.maxPreviewLength) + '…';
  }

  private buildReason(
    level: SensitivityLevel,
    matchedRules: ClassificationRule[],
    fieldClassifications: FieldClassification[],
  ): string {
    if (matchedRules.length === 0) {
      return 'No sensitive data patterns detected — classified as public';
    }

    const categories = [...new Set(fieldClassifications.map((fc) => fc.category))];
    const blockedCount = fieldClassifications.filter((fc) => fc.block).length;

    let reason = `Classified as ${level}: ${categories.join(', ')}`;

    if (blockedCount > 0) {
      reason += ` (${blockedCount} blocking rule${blockedCount > 1 ? 's' : ''} matched)`;
    }

    return reason;
  }
}

// ── Enforcement result ────────────────────────────────────────────────

export interface ClassificationEnforcementResult {
  /** The classification result */
  classification: ClassificationResult;
  /** Whether the data is allowed to proceed */
  allowed: boolean;
  /** Whether PolicyEnforcer was used */
  enforced: boolean;
  /** PolicyEnforcer result (if enforcement was applied) */
  policyResult: import('./PolicyEnforcer').EnforcedResult | null;
}

export default DataClassifier;