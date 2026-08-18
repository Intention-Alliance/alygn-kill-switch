"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import { ClusterTable } from "@/components/dashboard/cluster-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { SystemHealthPanel } from "@/components/dashboard/system-health-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMachineSelection } from "@/lib/machine-selection-context";
import type { DashboardCluster } from "@/lib/dashboard-utils";
import type { Cluster } from "@/types/supabase.types";
import type { Machine } from "@/types/shared";
import {
  adaptMachineToCluster,
  computeDashboardStats,
  type DashboardStats,
} from "@/lib/dashboard-utils";
import {
  Activity,
  AlertTriangle,
  Clock,
  Download,
  Plus,
  Server,
  Shield,
} from "lucide-react";
import Link from "next/link";

// ============================================================================
// COMPONENT
// ============================================================================

export default function DashboardPage() {
  const router = useRouter();
  const { status, machines, auditLog, isConnected } = useKillSwitchWebSocket();
  const { selectedMachine, selectMachine } = useMachineSelection();

  const [clusters, setClusters] = useState<DashboardCluster[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalEvents: 0,
    violations: 0,
    avgLatency: 0,
    uptime: 99.97,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Handle machine row click — navigate to dedicated detail page.
  // The `/machines/[id]` page is the canonical destination (full layout,
  // DPU banner, audit log, Quick Actions, machine-context sidebar).
  const handleSelectMachine = useCallback(
    (cluster: Cluster) => {
      // Clusters on this page are adapted from Machine data (DashboardCluster),
      // so the runtime shape includes extended fields.
      const dc = cluster as unknown as DashboardCluster;

      // Populate the machine-selection context so the sidebar shows
      // machine context on the destination route as well.
      const machine = machines.find((m: Machine) => m.id === dc.id);
      if (machine) {
        selectMachine(machine);
      }

      router.push(`/machines/${dc.id}`);
    },
    [machines, router, selectMachine],
  );

  // Adapt machines → clusters when data arrives
  useEffect(() => {
    if (machines.length === 0) return;

    const adaptedClusters = machines.map(adaptMachineToCluster);
    setClusters(adaptedClusters);
    setStats(computeDashboardStats(adaptedClusters, auditLog));
    setIsLoading(false);
  }, [machines, auditLog]);

  // Fallback: if machines are empty but auditLog loads, still mark loading done
  useEffect(() => {
    if (isConnected && machines.length === 0) {
      // Give WS time — mark loading done after a short timeout
      const t = setTimeout(() => setIsLoading(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isConnected, machines.length]);

  // ─── Export Report ──────────────────────────────────────────

  const exportReport = useCallback(() => {
    const report = {
      generated_at: new Date().toISOString(),
      system_status: stats.violations > 0 ? "NON-COMPLIANT" : "COMPLIANT",
      clusters,
      statistics: stats,
      recent_events: auditLog.slice(0, 100),
      kill_switch_state: status?.state ?? "UNKNOWN",
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [clusters, stats, auditLog, status]);

  // ─── Loading State ──────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-8 space-y-8">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            ALYGN Ledger
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Sovereign Compliance Monitoring Dashboard
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            asChild
            variant="outline"
            className="border-primary/20 hover:bg-primary/5"
          >
            <Link href="/machines">
              <Plus className="size-4 mr-2" />
              Register Machine
            </Link>
          </Button>
          <Button
            onClick={exportReport}
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            title="Export Report"
          >
            <Download className="size-5" />
          </Button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          icon={<Activity className="size-5" />}
          label="Total Enforcement Events"
          value={stats.totalEvents.toLocaleString()}
          trend="+12%"
          trendUp
        />
        <StatCard
          icon={<AlertTriangle className="size-5" />}
          label="Active Violations"
          value={stats.violations.toString()}
          trend={stats.violations > 0 ? "Critical Action" : "No active breaches"}
          trendUp={false}
          alert={stats.violations > 0}
        />
        <StatCard
          icon={<Clock className="size-5" />}
          label="Avg Cross-Cluster Latency"
          value={`${stats.avgLatency.toFixed(2)}ms`}
          trend="Target < 5ms"
          trendUp={stats.avgLatency < 5}
        />
        <StatCard
          icon={<Shield className="size-5" />}
          label="Global Network Uptime"
          value={`${stats.uptime}%`}
          trend="Tier-1 reliability"
          trendUp
        />
      </div>

      {/* Main Content */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold tracking-tight">
              Active Cluster Registry
            </h2>
          </div>
          <Badge variant="outline" className="font-mono text-xs py-1">
            {clusters.length} NODES DISCOVERED
          </Badge>
        </div>

        {/* 2-column layout: machine table left, system health right.
            Row click navigates to /machines/[id] (no inline detail panel). */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3">
            <ClusterTable
              clusters={clusters as Cluster[]}
              isLoading={isLoading}
              onSelectMachine={handleSelectMachine}
              selectedId={selectedMachine?.id}
            />
          </div>

          <div className="xl:col-span-1">
            <SystemHealthPanel
              auditLog={auditLog}
              killSwitchState={status?.state ?? null}
              pausedRequestCount={status?.pausedRequestCount ?? 0}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
