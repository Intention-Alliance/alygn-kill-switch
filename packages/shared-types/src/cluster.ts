/**
 * GPU Cluster and DPU Types
 * 
 * Used by the web-regulator dashboard for Blackwell Corridor monitoring.
 */

/**
 * Operational status of a GPU cluster
 */
export type ClusterStatus = 'operational' | 'degraded' | 'offline' | 'maintenance';

/**
 * GPU cluster in the Blackwell Corridor network
 */
export interface GPUCluster {
  /** Unique cluster identifier */
  id: string;
  /** Human-readable cluster name */
  name: string;
  /** Physical location */
  location: string;
  /** Number of active GPUs */
  gpus: number;
  /** Current kill-switch latency (milliseconds) */
  latency: number;
  /** Operational status */
  status: ClusterStatus;
  /** Last heartbeat timestamp */
  last_heartbeat?: string;
}

/**
 * DPU (Data Processing Unit) information
 */
export interface DPUInfo {
  /** DPU identifier */
  id: string;
  /** Hardware model (e.g., 'BlueField-3') */
  model: string;
  /** Firmware version hash */
  firmware_hash: string;
  /** Whether DPU is safety-locked */
  is_safety_locked: boolean;
  /** Last attestation timestamp */
  last_attestation?: string;
  /** Associated cluster ID */
  cluster_id: string;
}

/**
 * Intent Manifest for AI agent memory boundaries
 */
export interface IntentManifest {
  /** Base memory address */
  base_addr: bigint;
  /** Memory region size in bytes */
  size: bigint;
  /** AI agent identifier */
  agent_id: number;
  /** Whether this is GPU memory */
  is_gpu_memory: boolean;
}

/**
 * RDMA security thresholds
 */
export interface SecurityThresholds {
  /** Max malformed packets before redline */
  malformed_threshold: number;
  /** Detection window in microseconds */
  detection_window_us: number;
  /** Grid threat threshold in Gbps */
  grid_threat_gbps: number;
  /** Grid threat window in microseconds */
  grid_threat_window_us: number;
}
