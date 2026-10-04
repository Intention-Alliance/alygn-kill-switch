"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Clock,
  Download,
  Plus,
  Server,
  Shield,
  ScrollText,
} from "lucide-react";
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import { ClusterTable } from "@/components/dashboard/cluster-table";
import { StatCard } from "@/components/dashboard/stat-card";
import { SystemHealthPanel } from "@/components/dashboard/system-health-panel";
import { KillSwitchView } from "@/components/kill-switch/kill-switch-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useMachineSelection } from "@/lib/machine-selection-context";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/branding";
import type { DashboardCluster } from "@/lib/dashboard-utils";
import type { Cluster } from "@/types/db.types";
import type {
  Machine,
  KillSwitchState,
  KillSwitchStatus,
  ActivationRecord,
  VerificationEventMessage,
} from "@/types/shared";
import {
  adaptMachineToCluster,
  computeDashboardStats,
  type DashboardStats,
} from "@/lib/dashboard-utils";

type TabKey = "overview" | "kill-switch" | "logs";

const VALID_TABS: TabKey[] = ["overview", "kill-switch", "logs"];

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (VALID_TABS as string[]).includes(value);
}

export default function DashboardTabs({ initialTab }: { initialTab: TabKey }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, machines, auditLog, isConnected, reconnectAttempt, verificationEvents } =
    useKillSwitchWebSocket();
  const { selectedMachine, selectMachine } = useMachineSelection();

  const [clusters, setClusters] = useState<DashboardCluster[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalEvents: 0,
    violations: 0,
    avgLatency: 0,
    // No fabricated uptime — 0 renders a loading/unknown state until real
    // machine data arrives via computeDashboardStats.
    uptime: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Active tab — derived from the URL `?tab=` search param (default overview).
  // Keeps deep links (`/?tab=kill-switch`) working and stays in sync with
  // browser back/forward.
  const activeTab: TabKey = isTabKey(searchParams.get("tab"))
    ? (searchParams.get("tab") as TabKey)
    : initialTab;

  // ─── Tab switching (shallow URL update, no scroll jump) ──────────
  const handleTabChange = useCallback(
    (value: string) => {
      const tab = isTabKey(value) ? value : "overview";
      router.replace(`/?tab=${tab}`, { scroll: false });
    },
    [router],
  );

  // Handle machine row click — navigate to dedicated detail page.
  const handleSelectMachine = useCallback(
    (cluster: Cluster) => {
      const dc = cluster as unknown as DashboardCluster;
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
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `compliance-report-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [clusters, stats, auditLog, status]);

  // ─── Kill Switch state change (from Kill Switch tab) ──────────
  const handleKillSwitchStateChange = useCallback(
    (_newState: KillSwitchState) => {
      // Status updates propagate via WebSocket; no manual set needed.
    },
    [],
  );

  return (
    <div className="min-h-screen p-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            {BRAND_NAME} Ledger
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            {BRAND_TAGLINE}
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

      {/* Tabs — 2-step IA: Overview → Kill Switch → Logs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="overview">
            <Activity className="size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="kill-switch">
            <Shield className="size-4" />
            Kill Switch
          </TabsTrigger>
          <TabsTrigger value="logs">
            <ScrollText className="size-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        {/* ─── Overview tab (current / dashboard) ─────────────── */}
        <TabsContent value="overview" className="space-y-8">
          {isLoading ? (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-96 rounded-xl" />
            </div>
          ) : (
            <>
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
                    stats.violations > 0
                      ? "Critical Action"
                      : "No active breaches"
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
            </>
          )}
        </TabsContent>

        {/* ─── Kill Switch tab — same component as /kill-switch (S5) ── */}
        <TabsContent value="kill-switch" className="space-y-6">
          <KillSwitchView
            status={status}
            auditLog={auditLog}
            isConnected={isConnected}
            reconnectAttempt={reconnectAttempt}
            onStateChange={handleKillSwitchStateChange}
          />
        </TabsContent>

        {/* ─── Logs tab (placeholder → /kill-switch or future /logs) ── */}
        <TabsContent value="logs" className="space-y-6">
          <LogsTab auditLog={auditLog} verificationEvents={verificationEvents} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
// ============================================================================
// Logs tab — placeholder card linked to /kill-switch or future /logs route
// ============================================================================

function LogsTab({
  auditLog,
  verificationEvents = [],
}: {
  auditLog: ActivationRecord[];
  verificationEvents?: VerificationEventMessage["payload"][];
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Full compliance and kill-switch event stream
          </p>
        </div>
      </div>

      <Separator />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          {auditLog.length > 0 ? (
            <ul className="space-y-2">
              {auditLog.slice(0, 20).map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {entry.previousState} → {entry.newState}
                    </Badge>
                  </div>
                  <p className="mt-1">
                    <span className="font-medium">{entry.user}</span>
                    <span className="text-muted-foreground"> — </span>
                    {entry.reason}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No events yet. Events will appear here as the kill switch and
              machines report activity.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Live Verification Activity — inference verdicts streamed over WS.
          Fixes "no activity running": the events arrive via WebSocket but
          were never rendered anywhere in the dashboard. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Live Verification Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {verificationEvents.length > 0 ? (
            <ul className="space-y-2">
              {verificationEvents.slice(0, 20).map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(ev.timestamp).toLocaleString()}
                    </span>
                    <Badge
                      variant={
                        ev.verdict === "UNSAFE"
                          ? "destructive"
                          : ev.verdict === "REVIEW"
                            ? "secondary"
                            : "default"
                      }
                      className="font-mono text-xs"
                    >
                      {ev.verdict}
                    </Badge>
                  </div>
                  <p className="mt-1">
                    <span className="font-medium">{ev.model}</span>
                    <span className="text-muted-foreground"> — </span>
                    {ev.reason ?? "Standard inference verification"}
                    {ev.confidence !== undefined && (
                      <span className="text-muted-foreground">
                        {" "}
                        (conf {(ev.confidence * 100).toFixed(0)}%)
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No verification events yet. Inference verdicts from the
              verifier will stream here in real time.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        Full audit stream is available on the{" "}
        <Link
          href="/kill-switch"
          className="text-primary underline underline-offset-3 hover:text-foreground"
        >
          Kill Switch
        </Link>{" "}
        page. A dedicated <code className="font-mono">/logs</code> route is
        planned.
      </p>
    </div>
  );
}
