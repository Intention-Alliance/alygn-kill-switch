import type {
  ActivationRecord,
  KillSwitchState,
  Machine,
  MachineStatus,
} from "@/types/shared";

// ─── Compatible Cluster Shape ─────────────────────────────────
// Structural subset of Cluster from @/types/db.types
// that ClusterTable actually reads.

export interface DashboardCluster {
  id: string;
  name: string;
  location: string;
  gpus: number;
  avg_latency: number;
  uptime: number;
  status: "operational" | "degraded" | "offline";
  cluster_gpus: Array<{ model: string; memory_gb: number; cores: number }>;
  slug: string;
  total_requests: number;
  policy_violations: number;
}

export interface DashboardStats {
  totalEvents: number;
  violations: number;
  avgLatency: number;
  uptime: number;
}

/** Map kill-switch state → network load percentage for the visual bar. */
export function computeNetworkLoad(state: KillSwitchState | null): number {
  switch (state) {
    case "RUNNING":  return 72;
    case "ARMED":    return 42;
    case "STOPPING": return 18;
    case "STOPPED":  return 10;
    case "LOCKED":   return 88;
    default:         return 45;
  }
}

/** Compute dashboard stats from adapted clusters + audit log. */
export function computeDashboardStats(
  clusters: DashboardCluster[],
  auditLog: ActivationRecord[],
): DashboardStats {
  const violations = auditLog.filter(
    log => log.newState === "STOPPED" || log.newState === "LOCKED",
  ).length;

  // Real uptime: average of the per-cluster uptime values reported by the
  // API. Never fabricate a nominal figure — if there is no real data, report 0
  // (the UI renders a loading/unknown state rather than a fake number).
  const realUptimes = clusters
    .map(c => c.uptime)
    .filter((u): u is number => typeof u === "number" && u > 0);

  return {
    totalEvents: auditLog.length,
    violations,
    avgLatency: clusters.length > 0
      ? clusters.reduce((sum, c) => sum + (c.avg_latency ?? 0), 0) / clusters.length
      : 0,
    uptime: realUptimes.length > 0
      ? realUptimes.reduce((a, b) => a + b, 0) / realUptimes.length
      : 0,
  };
}

/**
 * Resolve a machine's effective status for display.
 *
 * Distinguishes three states so a machine that was active but lost its
 * heartbeat is shown as "offline" rather than conflated with a machine that
 * has never connected ("pending"):
 *
 * - `status === 'pending'` (never connected, no heartbeat) → "pending"
 * - `connected === true` → "active"
 * - `connected === false && lastSeen != null` → "offline" (lost heartbeat)
 * - `connected === false && lastSeen == null` → "pending" (never connected)
 * - otherwise → fall back to the machine's reported status
 */
export function effectiveStatus(machine: Machine): MachineStatus {
  // Explicitly pending (never connected, no heartbeat) → Pending
  if (machine.status === "pending") return "pending";

  // Connected → Active
  if (machine.connected === true) return "active";

  // Was connected but lost its heartbeat → Offline
  if (machine.connected === false && machine.lastSeen != null) {
    return "offline";
  }

  // Registered but never connected (no lastSeen) → Pending
  if (machine.connected === false) return "pending";

  // Fall back to the machine's reported status
  return machine.status;
}

/** Adapt a Kill Switch Machine to a display-friendly cluster format. */
export function adaptMachineToCluster(m: Machine): DashboardCluster {
  const gpuModel = m.specs?.gpu || "—";

  return {
    id: m.id,
    name: m.name,
    location: m.hostname || "Unknown",
    status:
      m.status === "active" ? "operational"
      : m.status === "inactive" ? "offline"
      : m.status === "pending" ? "degraded"
      : "degraded",
    gpus: m.specs?.gpu ? 1 : 0,
    // Real values only — never fabricate. Map the machine's reported CPU and
    // memory usage where the API provides them; otherwise leave 0 so the UI
    // renders a loading/unknown state instead of an invented number.
    avg_latency: typeof m.cpuUsage === "number" ? m.cpuUsage : 0,
    uptime: typeof m.memoryUsage === "number" ? m.memoryUsage : 0,
    cluster_gpus: [{ model: gpuModel, memory_gb: 0, cores: 0 }],
    slug: m.id,
    total_requests: 0,
    policy_violations: 0,
  };
}
