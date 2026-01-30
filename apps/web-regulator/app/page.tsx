"use client";

import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  Activity,
  AlertTriangle,
  Clock,
  Download,
  LogOut,
  Plus,
  Server,
  Shield,
  UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

interface SystemStats {
  totalEvents: number;
  violations: number;
  avgLatency: number;
  uptime: number;
}

import { ClusterTable } from "@/components/dashboard/cluster-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AuditLogEntry, Cluster } from "@/types/supabase.types";

// ============================================================================
// COMPONENT
// ============================================================================

export default function DashboardPage() {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    totalEvents: 0,
    violations: 0,
    avgLatency: 0,
    uptime: 99.97,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const supabase = useMemo(() => createClient(), []);

  // Fetch all data from Supabase
  const fetchData = useCallback(async () => {
    try {
      // Fetch clusters
      const { data: clusterData, error: clusterError } = await supabase
        .from("dpu_clusters")
        .select("*, cluster_gpus(*)")
        .order("name");

      if (clusterError) throw clusterError;
      setClusters(clusterData || []);

      // Fetch recent audit logs
      const { data: logsData, error: logsError } = await supabase
        .from("compliance_audit_log")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(50);

      if (logsError) throw logsError;
      setAuditLogs(logsData || []);

      // Calculate global stats from cluster aggregations
      const totalEvents =
        clusterData?.reduce(
          (acc, curr) => acc + (Number(curr.total_requests) || 0),
          0,
        ) || 0;
      const totalViolations =
        clusterData?.reduce(
          (acc, curr) => acc + (Number(curr.policy_violations) || 0),
          0,
        ) || 0;
      const avgLat =
        (clusterData?.reduce((acc, curr) => acc + (curr.avg_latency || 0), 0) ||
          0) / (clusterData?.length || 1);

      setStats({
        totalEvents,
        violations: totalViolations,
        avgLatency: avgLat || 0,
        uptime: 99.98, // Placeholder for global uptime
      });
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // Subscribe to realtime updates
  // biome-ignore lint/correctness/useExhaustiveDependencies: No need to add functions as dep else, we get infinite loop
  useEffect(() => {
    // Check user session
    const checkUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };

    checkUser();

    if (!clusters.length) {
      fetchData();
    }

    // Re-subscribe to audit logs for global counts
    const auditChannel = supabase
      .channel("global-audit")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "compliance_audit_log" },
        (payload) => {
          const newLog = payload.new as AuditLogEntry;
          setAuditLogs((prev) => [newLog, ...prev.slice(0, 49)]);

          // We increment locally for immediate feedback,
          // but cluster updates will eventually trigger fetchData() for absolute truth
          setStats((prev) => ({
            ...prev,
            totalEvents: prev.totalEvents + 1,
            violations: prev.violations + (newLog.redline_violated ? 1 : 0),
          }));
        },
      )
      .subscribe();

    // Subscribe to cluster changes for status and stats updates
    const clusterChannel = supabase
      .channel("global-clusters")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dpu_clusters" },
        (payload) => {
          if (payload.eventType === "UPDATE") {
            // If it's an update, we could surgically update the stats,
            // but fetchData is safer to keep totals in sync with reality
            fetchData();
          } else {
            fetchData();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(auditChannel);
      supabase.removeChannel(clusterChannel);
    };
  }, []);

  // Export compliance report
  const exportReport = () => {
    const auditLogsLength = auditLogs.length;
    const auditViolationsLength = auditLogs.filter(
      (log) => log.redline_violated,
    ).length;
    const report = {
      generated_at: new Date().toISOString(),
      system_status:
        // ? If more than the 10% of audits are in violations, then we do declare it as compliant...
        // ? the percetange may change in future.
        auditViolationsLength > auditLogsLength * 0.1
          ? "NON-COMPLIANT"
          : "COMPLIANT",
      clusters: clusters,
      statistics: stats,
      recent_logs: auditLogs.slice(0, 100),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          {user ? (
            <>
              <div className="hidden md:flex flex-col items-end mr-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Authenticated Regulator
                </p>
                <p className="text-xs font-medium">{user.email}</p>
              </div>
              <Button
                asChild
                variant="outline"
                className="border-primary/20 hover:bg-primary/5"
              >
                <Link href="/clusters/add">
                  <Plus className="size-4 mr-2" />
                  Add Cluster
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.reload();
                }}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Sign Out"
              >
                <LogOut className="size-5" />
              </Button>
            </>
          ) : (
            <Button
              asChild
              variant="default"
              className="shadow-lg shadow-primary/20"
            >
              <Link href="/auth/login">
                <UserIcon className="size-4 mr-2" />
                Sign In to Manage
              </Link>
            </Button>
          )}
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
          trend={
            stats.violations > 0 ? "Critical Action" : "No active breaches"
          }
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

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Detailed Table */}
          <div className="xl:col-span-3">
            <ClusterTable clusters={clusters} isLoading={isLoading} />
          </div>

          {/* Side Info */}
          <div className="xl:col-span-1 border border-border/50 bg-card/30 rounded-xl p-6 backdrop-blur-md space-y-6">
            <div className="space-y-2">
              <h3 className="font-semibold text-lg">System Health</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                All ALYGN nodes are currently reporting within nominal
                parameters. Average kill-switch latency is performing at 140%
                above target threshold.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">
                  Network Load
                </span>
                <span className="font-bold text-primary">Normal</span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[45%]" />
              </div>
            </div>

            <div className="h-px w-full bg-border/50" />

            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recent Security Events
              </h4>
              <div className="space-y-3">
                {auditLogs.slice(0, 3).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-2 rounded-lg bg-background/50 border border-border/30"
                  >
                    <div
                      className={cn(
                        "mt-1.5 size-2 rounded-full",
                        log.redline_violated
                          ? "bg-destructive animate-pulse"
                          : "bg-green-500",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">
                        {log.redline_violated ||
                          "Standard Inference Verification"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
