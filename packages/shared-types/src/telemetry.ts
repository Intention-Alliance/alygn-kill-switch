/**
 * Telemetry and Zero-Knowledge Proof Types
 * 
 * Used by C++ telemetry handler and Node.js services.
 */

/**
 * Zero-Knowledge Proof structure for compliance verification
 */
export interface ZKProof {
  /** Commitment to model weights (hides actual weights) */
  zkp_commitment: string;
  /** Challenge derived from intent + behavior hash */
  zkp_challenge: string;
  /** Cryptographic response proving compliance */
  zkp_response: string;
  /** Public verifiable hash (doesn't reveal weights) */
  public_hash: string;
  /** Timestamp of proof generation (nanoseconds since epoch) */
  timestamp: number;
  /** Whether the proof is publicly visible */
  public_visibility?: boolean;
}

/**
 * Telemetry event from DPU or inference service
 */
export interface TelemetryEvent {
  /** Unique event identifier (UUID v4) */
  id: string;
  /** Event timestamp (nanoseconds since epoch) */
  timestamp: number;
  /** Type of event: 'inference', 'enforcement', 'heartbeat' */
  event_type: 'inference' | 'enforcement' | 'heartbeat';
  /** DPU identifier that generated the event */
  dpu_id: string;
  /** SHA-256 hash of the intent manifest */
  intent_hash: string;
  /** SHA-256 hash of the model behavior/output */
  behavior_hash: string;
  /** HMAC-SHA256 attestation signature */
  attestation: string;
  /** Zero-Knowledge Proof data (serialized JSON) */
  zkp_proof: string;
  /** Policy redline that was violated (null if compliant) */
  redline_violated: string | null;
  /** Additional metadata (JSON string) */
  metadata: string;
}

/**
 * Supabase configuration for database connections
 */
export interface SupabaseConfig {
  /** PostgreSQL connection string */
  connection_string: string;
  /** Target table name */
  table_name: string;
  /** Connection pool size */
  pool_size: number;
}

/**
 * SOS-Hook handler configuration
 */
export interface SOSConfig {
  /** Path to intent manifest file */
  intent_manifest_path: string;
  /** DPU identifier */
  dpu_id: string;
  /** Number of events to batch before flush */
  batch_size: number;
  /** Interval between flushes (milliseconds) */
  flush_interval_ms: number;
  /** Enable Zero-Knowledge Proof generation */
  enable_zkp: boolean;
  /** Enable performance metrics collection */
  enable_performance_metrics: boolean;
}
