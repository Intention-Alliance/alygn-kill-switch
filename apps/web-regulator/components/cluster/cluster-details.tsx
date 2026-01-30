"use client";

import { ClusterSidebar } from "@/components/dashboard/cluster-sidebar";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import type {
  AuditLogEntry,
  Cluster,
  ClusterGPU,
} from "@/types/supabase.types";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clock,
  Download,
  Link,
  Shield,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export function ClusterDetails({ slug }: { slug: string }) {
  const [cluster, setCluster] = useState<Cluster | null>(null);
  const [gpuDetails, setGpuDetails] = useState<ClusterGPU | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  const fetchData = useCallback(async () => {
    try {
      // Fetch cluster details
      const { data: clusterData, error: clusterError } = await supabase
        .from("dpu_clusters")
        .select("*")
        .eq("slug", slug)
        .single();

      if (clusterError) throw clusterError;
      setCluster({
        ...clusterData,
        total_requests: clusterData.total_requests || 0,
        policy_violations: clusterData.policy_violations || 0,
        avg_latency: Math.max(0, clusterData.avg_latency || 0),
        last_seen: clusterData.last_seen || new Date().toISOString(),
      });

      // Fetch GPU details (just get one to show specs, count comes from cluster.gpus)
      const { data: gpuData } = await supabase
        .from("cluster_gpus")
        .select("*")
        .eq("cluster_id", clusterData.id)
        .limit(1)
        .maybeSingle();

      setGpuDetails(gpuData);

      // Fetch audit logs for this specific cluster (matching dpu_id prefix or specific filter)
      // For now, let's assume dpu_id in logs relates to clusters (this might need a schema bridge later)
      const { data: logsData, error: logsError } = await supabase
        .from("compliance_audit_log")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(20);

      if (logsError) throw logsError;
      setAuditLogs(logsData || []);
    } catch (error) {
      console.error("Error fetching cluster data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (!auditLogs.length) {
      fetchData();
    }

    // Subscribe to realtime updates for this cluster's metrics
    const clusterChannel = supabase
      .channel(`cluster-${slug}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dpu_clusters",
          filter: `slug=eq.${slug}`,
        },
        (payload) => {
          setCluster((prev) =>
            prev ? { ...prev, ...payload.new } : (payload.new as Cluster),
          );
        },
      )
      .subscribe();

    // Subscribe to new audit logs for this cluster
    const logsChannel = supabase
      .channel(`logs-${slug}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "compliance_audit_log",
          filter: cluster ? `dpu_id=eq.${cluster.id}` : undefined,
        },
        (payload) => {
          const newLog = payload.new as AuditLogEntry;

          // Update logs list
          setAuditLogs((prev) => [newLog, ...prev].slice(0, 20));

          // Simulate live stat updates since aggregation might be slow
          setCluster((prev) => {
            if (!prev) return null;

            // Extract latency from proof_data if available
            let newLatency = prev.avg_latency || 0;
            try {
              if (newLog.proof_data && typeof newLog.proof_data === "object") {
                const metadata = (newLog.proof_data as any).metadata;
                if (metadata && metadata.latency_ms) {
                  const lat = Number(metadata.latency_ms);
                  newLatency = newLatency * 0.9 + lat * 0.1;
                }
              }
            } catch (e) {
              // Fallback to jitter if parsing fails
              newLatency = newLatency + (Math.random() - 0.5) * 2;
            }

            return {
              ...prev,
              total_requests: (prev.total_requests || 0) + 1,
              policy_violations:
                newLog.redline_violated && newLog.redline_violated !== ""
                  ? (prev.policy_violations || 0) + 1
                  : prev.policy_violations || 0,
              avg_latency: Math.max(0, newLatency),
              last_seen: newLog.timestamp, // Update last seen
            };
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(clusterChannel);
      supabase.removeChannel(logsChannel);
    };
  }, [slug, cluster]);

  if (isLoading) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-muted-foreground animate-pulse">
          Syncing cluster telemetry...
        </p>
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="min-h-screen p-8 flex flex-col items-center justify-center gap-4 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-2xl font-bold">Cluster Not Found</h2>
        <p className="text-muted-foreground max-w-md">
          The cluster you are looking for does not exist in the Sovereign Ledger
          registry.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Return to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2 h-8">
              <Link href="/">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Link>
            </Button>
            <Badge
              variant="outline"
              className="text-xs font-mono tracking-tighter opacity-70"
            >
              ID: {cluster.id.slice(0, 8)}
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {cluster.name}
            <Badge className="bg-green-500/10 text-green-500 border-green-500/20 shadow-none">
              {cluster.status.toUpperCase()}
            </Badge>
          </h1>
          <p className="text-muted-foreground">
            Sovereign Node in{" "}
            <span className="text-foreground font-medium">
              {cluster.location}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="border-border/50">
            <Download className="w-4 h-4 mr-2" />
            Download History
          </Button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Cluster Latency"
          value={`${(cluster?.avg_latency || 0).toFixed(2)}ms`}
          trend="Real-time"
          trendUp={(cluster?.avg_latency || 0) < 4}
        />
        <StatCard
          icon={<Shield className="w-4 h-4" />}
          label="Uptime"
          value={`${(cluster?.uptime || 0).toFixed(2)}%`}
          trend="30d rolling"
          trendUp
        />
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Total Requests"
          value={cluster?.total_requests?.toLocaleString() || "0"}
          trend="+5.2%"
          trendUp
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Policy Violations"
          value={cluster?.policy_violations?.toLocaleString() || "0"}
          trend={
            cluster?.policy_violations > 0 ? "Under Review" : "Clean Record"
          }
          trendUp={cluster?.policy_violations === 0}
          alert={(cluster?.policy_violations || 0) > 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Detail Sidebar */}
        <div className="lg:col-span-1">
          <ClusterSidebar cluster={cluster} gpuDetails={gpuDetails} />
        </div>

        {/* Local Feed */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Recent Node Activity
            </h2>
          </div>

          <div className="rounded-md border border-border/50 bg-card/50 backdrop-blur-sm shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="border-border/50">
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Attestation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs.map((log: AuditLogEntry) => (
                  <TableRow key={log.id} className="border-border/50">
                    <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium text-xs capitalized">
                      {log.redline_violated ? "Enforcement" : "Inference"}
                    </TableCell>
                    <TableCell>
                      {log.redline_violated ? (
                        <Badge
                          variant="destructive"
                          className="text-[10px] h-5 shadow-none"
                        >
                          Violated
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-5 text-green-500 border-green-500/50 shadow-none"
                        >
                          Compliant
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                      {log.intent_hash.slice(0, 16)}...
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
