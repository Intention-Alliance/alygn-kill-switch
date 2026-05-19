import type { ActivationRecord, KillSwitchState, Machine } from "@/types/shared";

// ─── Compatible Cluster Shape ─────────────────────────────────
// Structural subset of Cluster from @/types/supabase.types
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

  return {
    totalEvents: auditLog.length,
    violations,
    avgLatency: clusters.length > 0
      ? clusters.reduce((sum, c) => sum + (c.avg_latency ?? 0), 0) / clusters.length
      : 0,
    uptime: clusters.length > 0 ? 99.97 : 0,
  };
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
      : "degraded",
    gpus: m.specs?.gpu ? 1 : 0,
    avg_latency: m.cpuUsage ?? 0,
    uptime: m.status === "active" ? 99.9 : m.status === "inactive" ? 0 : 50,
    cluster_gpus: [{ model: gpuModel, memory_gb: 0, cores: 0 }],
    slug: m.id,
    total_requests: 0,
    policy_violations: 0,
  };
}
