/**
 * Slashing Engine Types
 * 
 * Used by the server-slashing-engine for cryptoeconomic enforcement.
 */

/**
 * Severity level of a policy violation
 */
export type ViolationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Action to take when a violation is detected
 */
export type SlashAction = 'BURN' | 'REDISTRIBUTE' | 'WARN';

/**
 * Slashing rule for a specific redline policy
 */
export interface SlashingRule {
  /** Redline policy identifier */
  policy: string;
  /** Severity level */
  severity: ViolationSeverity;
  /** Percentage of stake to slash (0-100) */
  slash_percentage: number;
  /** Action to take with slashed tokens */
  action: SlashAction;
  /** Human-readable description */
  description: string;
}

/**
 * Default slashing rules based on policy type
 */
export const SLASHING_RULES: Record<string, SlashingRule> = {
  policy_harmful_content: {
    policy: 'policy_harmful_content',
    severity: 'CRITICAL',
    slash_percentage: 100,
    action: 'BURN',
    description: 'Full stake burn for harmful content generation',
  },
  policy_data_exfiltration: {
    policy: 'policy_data_exfiltration',
    severity: 'CRITICAL',
    slash_percentage: 100,
    action: 'BURN',
    description: 'Full stake burn for unauthorized data access',
  },
  policy_model_tampering: {
    policy: 'policy_model_tampering',
    severity: 'HIGH',
    slash_percentage: 75,
    action: 'REDISTRIBUTE',
    description: 'Partial slash for model weight manipulation',
  },
  policy_rate_limit_exceeded: {
    policy: 'policy_rate_limit_exceeded',
    severity: 'MEDIUM',
    slash_percentage: 25,
    action: 'REDISTRIBUTE',
    description: 'Minor slash for exceeding throughput limits',
  },
  policy_heartbeat_missed: {
    policy: 'policy_heartbeat_missed',
    severity: 'LOW',
    slash_percentage: 5,
    action: 'WARN',
    description: 'Warning for missed health check',
  },
};

/**
 * Webhook payload from Supabase for violation events
 */
export interface ViolationWebhookPayload {
  /** Webhook event type */
  type: 'INSERT';
  /** Table that triggered the webhook */
  table: 'compliance_audit_log';
  /** Schema name */
  schema: 'public';
  /** The inserted record */
  record: {
    id: string;
    timestamp: string;
    dpu_id: string;
    redline_violated: string;
    intent_hash: string;
    proof_data: {
      zkp_commitment: string;
      zkp_challenge: string;
      zkp_response: string;
      public_hash: string;
      timestamp: number;
    };
  };
  /** Previous record (null for INSERT) */
  old_record: null;
}

/**
 * Result of a slashing operation
 */
export interface SlashingResult {
  /** Whether the slashing was executed */
  executed: boolean;
  /** Transaction hash (if on-chain) */
  tx_hash?: string;
  /** Amount of tokens slashed */
  amount_slashed: string;
  /** Action taken */
  action: SlashAction;
  /** Timestamp of execution */
  executed_at: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * ALIGN token contract interface
 */
export interface ALIGNTokenContract {
  /** Burn tokens from a staker */
  burn(staker: string, amount: bigint): Promise<string>;
  /** Redistribute tokens to validators */
  redistribute(from: string, amount: bigint, validators: string[]): Promise<string>;
  /** Get stake balance for an address */
  getStake(address: string): Promise<bigint>;
}
