/**
 * Compliance Audit Log Types
 * 
 * Matches the Supabase compliance_audit_log table schema.
 */

/**
 * Proof data stored in the compliance audit log
 */
export interface ProofData {
  /** ZKP commitment hash */
  zkp_commitment?: string;
  /** ZKP challenge hash */
  zkp_challenge?: string;
  /** ZKP response hash */
  zkp_response?: string;
  /** Public verifiable hash */
  public_hash?: string;
  /** HMAC attestation signature */
  attestation?: string;
  /** Whether proof is publicly visible */
  public_visibility?: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Compliance audit log record (matches Supabase table)
 */
export interface ComplianceAuditLog {
  /** Unique event identifier (UUID v4) */
  id: string;
  /** Server-generated timestamp with timezone */
  timestamp: string;
  /** DPU identifier that triggered the event */
  dpu_id: string;
  /** Policy redline that was violated (null if compliant) */
  redline_violated: string | null;
  /** SHA-256 hash of the intent manifest (64 hex characters) */
  intent_hash: string;
  /** ZKP proofs, attestations, and metadata */
  proof_data: ProofData;
}

/**
 * Response from log_enforcement_event RPC function
 */
export interface LogEnforcementEventResponse {
  /** UUID of the created event */
  event_id: string | null;
  /** Timestamp of the event */
  event_timestamp: string;
  /** Whether the operation succeeded */
  success: boolean;
  /** Human-readable message */
  message: string;
}

/**
 * Response from batch_log_enforcement_events RPC function
 */
export interface BatchLogResponse {
  /** Number of events inserted */
  inserted_count: number;
  /** Whether the operation succeeded */
  success: boolean;
  /** Human-readable message */
  message: string;
}

/**
 * Response from get_audit_statistics RPC function
 */
export interface AuditStatistics {
  /** Total number of events in the time range */
  total_events: number;
  /** Number of violation events */
  total_violations: number;
  /** Number of unique DPUs */
  unique_dpus: number;
  /** Start of the time range */
  time_range_start: string;
  /** End of the time range */
  time_range_end: string;
}

/**
 * Response from verify_proof_integrity RPC function
 */
export interface ProofVerificationResult {
  /** Whether the proof is valid */
  is_valid: boolean;
  /** Detailed verification information */
  verification_details: {
    computed_hash?: string;
    stored_hash?: string;
    intent_hash?: string;
    timestamp?: string;
    error?: string;
  };
}
