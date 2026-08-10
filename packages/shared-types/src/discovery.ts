/**
 * AI-Agnostic Discovery — Shared Types (ADR-135)
 *
 * Uniform contract for the layered discovery abstraction. Every provider
 * backend (Ollama, Hugging Face, LlamaIndex, vLLM, OpenAI-compatible)
 * implements the same DiscoveryProvider interface so the kill switch can
 * operate identically regardless of which AI stack runs on a machine.
 *
 * Also carries the hardware integrity fingerprint types (ADR-134/135) and
 * the machine discovery lifecycle (NO auto-admission — ADR-135 §5).
 */

// ─── Provider Adapter Contract ────────────────────────────────────

export type ProviderId =
  | 'ollama'
  | 'huggingface'
  | 'llamaindex'
  | 'vllm'
  | 'openai-compatible';

export const PROVIDER_IDS: readonly ProviderId[] = [
  'ollama',
  'huggingface',
  'llamaindex',
  'vllm',
  'openai-compatible',
] as const;

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  version: string | null;
  baseUrl: string | null;
  detectedAt: string; // ISO timestamp
}

export interface ModelInfo {
  id: string;
  name: string;
  providerId: ProviderId;
  sizeBytes: number | null;
  quantization: string | null;
  family: string | null;
  served: boolean; // actively served by an inference endpoint
}

export interface ProviderHealth {
  healthy: boolean;
  latencyMs: number | null;
  error: string | null;
  checkedAt: string; // ISO timestamp
}

/**
 * Uniform contract every provider adapter implements (ADR-135 §1).
 * The system probes each adapter in priority order; the first that
 * responds affirmatively is the active provider for that machine.
 * A machine may host multiple providers — all are registered.
 */
export interface DiscoveryProvider {
  id: ProviderId;
  detect(): Promise<ProviderInfo | null>;
  listModels(): Promise<ModelInfo[]>;
  health(): Promise<ProviderHealth>;
}

// ─── Hardware Integrity Fingerprint (ADR-134/135 §3) ──────────────

export interface GpuFingerprint {
  name: string;
  vendor: string | null;
  pciId: string | null;
}

export interface HardwareFingerprint {
  cpuModel: string;
  cpuCores: number;
  memoryMb: number;
  gpus: GpuFingerprint[];
  diskGb: number;
  osRelease: string;
  macs: string[]; // network interface MACs — identity binding
  collectedAt: string; // ISO timestamp
}

export interface IntegritySignature {
  algorithm: 'sha256';
  hash: string; // hex digest of canonical fingerprint JSON
  signedAt: string; // ISO timestamp
}

export type IntegrityEventType = 'tamper' | 'swap' | 'reconfirmed';

export interface IntegrityDrift {
  event: IntegrityEventType;
  machineId: string;
  driftedFields: string[]; // e.g. ['gpus', 'macs']
  severity: 'low' | 'medium' | 'high';
  detectedAt: string; // ISO timestamp
}

// ─── Machine Discovery Lifecycle (ADR-135 §2, §5) ─────────────────

export type DiscoverySource = 'mdns' | 'arp-sweep' | 'heartbeat';

/**
 * NO auto-admission (ADR-135 §5): a newly detected machine enters
 * NEW_MACHINE and requires human confirmation before gaining any
 * kill-switch authority. NEW_MACHINE is the provisional state while
 * the admin reviews the fingerprint + inventory (it covers what was
 * originally envisioned as PENDING_CONFIRMATION — no code path
 * transitions to PENDING_CONFIRMATION; it is retained in the union
 * for forward-compatibility with multi-stage onboarding, ADR-138).
 *
 * ADR-138 lifecycle: NEW_MACHINE → PENDING_CONFIRMATION → ADMITTED | DENIED.
 * ADMITTED machines return to PENDING_REVIEW on high-severity integrity
 * drift (tamper/swap) and must be re-confirmed before operating again.
 */
export type MachineDiscoveryState =
  | 'NEW_MACHINE'
  | 'PENDING_CONFIRMATION'
  | 'ADMITTED'
  | 'PENDING_REVIEW'
  | 'DENIED';

export interface DiscoveredMachine {
  id: string;
  hostname: string;
  ip: string | null;
  source: DiscoverySource;
  state: MachineDiscoveryState;
  fingerprint: HardwareFingerprint | null;
  integritySignature: IntegritySignature | null;
  firstSeen: string; // ISO timestamp
  lastSeen: string; // ISO timestamp
  confirmedAt: string | null;
  confirmedBy: string | null;
}

export interface DiscoveredProvider {
  id: string;
  machineId: string;
  providerId: ProviderId;
  baseUrl: string | null;
  version: string | null;
  status: 'detected' | 'healthy' | 'unhealthy';
  detectedAt: string; // ISO timestamp
  lastHealthyAt: string | null;
}

export interface DiscoveredModel {
  id: string;
  machineId: string;
  providerId: ProviderId;
  modelId: string;
  name: string;
  sizeBytes: number | null;
  quantization: string | null;
  family: string | null;
  served: boolean;
  detectedAt: string; // ISO timestamp
}

/**
 * Full per-machine discovery report — what the admin reviews during
 * onboarding (ADR-138). Nothing in here is authoritative until the
 * machine is ADMITTED.
 */
export interface DiscoveryReport {
  machine: DiscoveredMachine;
  providers: DiscoveredProvider[];
  models: DiscoveredModel[];
  integrity: {
    signature: IntegritySignature | null;
    drift: IntegrityDrift | null;
  };
}

// ─── Onboarding & Multi-Tenant Registration (ADR-138) ─────────────

export type RegistrationRequestStatus = 'PENDING' | 'APPROVED' | 'DENIED';

export interface RegistrationRequest {
  id: string;
  machineId: string;
  requestedBy: string;
  status: RegistrationRequestStatus;
  denialReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null; // ISO timestamp
  createdAt: string; // ISO timestamp
}

export interface RogueDeviceAlert {
  id: string;
  hostname: string;
  ip: string | null;
  denialCount: number;
  lastDeniedAt: string; // ISO timestamp
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: string | null; // ISO timestamp
  createdAt: string; // ISO timestamp
}

/**
 * Result of an onboarding decision (approve/deny).
 */
export interface OnboardingDecision {
  machine: DiscoveredMachine;
  registration: RegistrationRequest;
  machineRecord: {
    id: string;
    name: string;
    hostname: string;
    monitoringOnly: boolean;
    zone: string;
  } | null;
  rogueAlert: RogueDeviceAlert | null;
}
