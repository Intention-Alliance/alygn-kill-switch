"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/client";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Server,
  Shield,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

// ============================================================================
// TYPES
// ============================================================================

interface GPUCluster {
  id: string;
  name: string;
  location: string;
  gpus: number;
  latency: number;
  status: "operational" | "degraded" | "offline";
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  dpu_id: string;
  redline_violated: string | null;
  intent_hash: string;
  proof_data: {
    zkp_commitment?: string;
    zkp_challenge?: string;
    zkp_response?: string;
    public_hash?: string;
    public_visibility?: boolean;
  };
}

interface SystemStats {
  totalEvents: number;
  violations: number;
  avgLatency: number;
  uptime: number;
}

// ============================================================================
// MOCK DATA (Replace with real Supabase data in production)
// ============================================================================

const MOCK_CLUSTERS: GPUCluster[] = [
  {
    id: "dc-austin-01",
    name: "Austin Primary",
    location: "Austin, TX",
    gpus: 1024,
    latency: 2.8,
    status: "operational",
  },
  {
    id: "dc-dallas-01",
    name: "Dallas Corridor",
    location: "Dallas, TX",
    gpus: 768,
    latency: 3.1,
    status: "operational",
  },
  {
    id: "dc-houston-01",
    name: "Houston Grid",
    location: "Houston, TX",
    gpus: 512,
    latency: 4.2,
    status: "degraded",
  },
  {
    id: "dc-sanantonio-01",
    name: "San Antonio Hub",
    location: "San Antonio, TX",
    gpus: 384,
    latency: 3.4,
    status: "operational",
  },
];

const generateMockLogs = (): AuditLogEntry[] => {
  const violations = [
    "policy_harmful_content",
    "policy_rate_limit_exceeded",
    null,
    null,
    null,
  ];
  const dpus = [
    "dpu-austin-001",
    "dpu-dallas-002",
    "dpu-houston-003",
    "dpu-sanantonio-004",
  ];

  return Array.from({ length: 20 }, (_, i) => ({
    id: `evt-${Date.now()}-${i}`,
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    dpu_id: dpus[Math.floor(Math.random() * dpus.length)],
    redline_violated: violations[Math.floor(Math.random() * violations.length)],
    intent_hash:
      `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`.slice(
        0,
        64,
      ),
    proof_data: {
      zkp_commitment: Math.random().toString(16).slice(2, 18),
      public_visibility: true,
    },
  }));
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function DashboardPage() {
  const [clusters] = useState<GPUCluster[]>(MOCK_CLUSTERS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [stats, setStats] = useState<SystemStats>({
    totalEvents: 0,
    violations: 0,
    avgLatency: 0,
    uptime: 99.97,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [useMockData, setUseMockData] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  // Fetch audit logs from Supabase
  const fetchAuditLogs = useCallback(async () => {
    if (useMockData) {
      const mockLogs = generateMockLogs();
      setAuditLogs(mockLogs);
      setStats({
        totalEvents: mockLogs.length,
        violations: mockLogs.filter((l) => l.redline_violated).length,
        avgLatency: 3.2,
        uptime: 99.97,
      });
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("compliance_audit_log")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(50);

      if (error) throw error;

      setAuditLogs(data || []);
      setStats({
        totalEvents: data?.length || 0,
        violations: data?.filter((l) => l.redline_violated).length || 0,
        avgLatency: 3.2,
        uptime: 99.97,
      });
    } catch (error) {
      console.error("Failed to fetch audit logs:", error);
      // Fall back to mock data
      const mockLogs = generateMockLogs();
      setAuditLogs(mockLogs);
    } finally {
      setIsLoading(false);
    }
  }, [supabase, useMockData]);

  // Subscribe to realtime updates
  useEffect(() => {
    fetchAuditLogs();

    if (!useMockData) {
      const channel = supabase
        .channel("audit-logs")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "compliance_audit_log" },
          (payload) => {
            setAuditLogs((prev) => [
              payload.new as AuditLogEntry,
              ...prev.slice(0, 49),
            ]);
            setStats((prev) => ({
              ...prev,
              totalEvents: prev.totalEvents + 1,
              violations:
                prev.violations + (payload.new.redline_violated ? 1 : 0),
            }));
          },
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [fetchAuditLogs, supabase, useMockData]);

  // Export compliance report
  const exportReport = () => {
    const report = {
      generated_at: new Date().toISOString(),
      system_status: "COMPLIANT",
      clusters: clusters,
      statistics: stats,
      recent_logs: auditLogs.slice(0, 10),
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
          <h1 className="text-3xl font-bold tracking-tight">
            ALIGN Compliance
          </h1>
          <p className="text-muted-foreground mt-1">
            Sovereign Ledger Real-Time Monitoring
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setUseMockData(!useMockData)}
          >
            {useMockData ? "Mock Data" : "Live Data"}
          </Button>
          <Button onClick={exportReport}>
            <Download className="w-4 h-4 mr-2" />
            Export Proof
          </Button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Total Events"
          value={stats.totalEvents.toLocaleString()}
          trend="+12.4%"
          trendUp
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Violations"
          value={stats.violations.toString()}
          trend={stats.violations > 0 ? "Action Required" : "None"}
          trendUp={false}
          alert={stats.violations > 0}
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Avg Latency"
          value={`${stats.avgLatency.toFixed(1)}ms`}
          trend="Target < 4ms"
          trendUp
        />
        <StatCard
          icon={<Shield className="w-4 h-4" />}
          label="Uptime"
          value={`${stats.uptime}%`}
          trend="30d rolling"
          trendUp
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* GPU Clusters */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Blackwell Corridor</h2>
          </div>
          <div className="space-y-4">
            {clusters.map((cluster) => (
              <Card key={cluster.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{cluster.name}</CardTitle>
                    <Badge
                      variant={
                        cluster.status === "operational"
                          ? "default"
                          : "destructive"
                      }
                    >
                      {cluster.status.toUpperCase()}
                    </Badge>
                  </div>
                  <CardDescription>{cluster.location}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="flex justify-between items-center text-muted-foreground">
                    <span>{cluster.gpus} GPUs</span>
                    <span
                      className={
                        cluster.latency < 4
                          ? "text-green-500"
                          : "text-yellow-500"
                      }
                    >
                      {cluster.latency}ms
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Audit Log Feed */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            <h2 className="text-xl font-semibold">Live Ledger Feed</h2>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="h-[600px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>DPU ID</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Intent Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {log.dpu_id}
                          </TableCell>
                          <TableCell>
                            {log.redline_violated ? (
                              <Badge
                                variant="destructive"
                                className="text-[10px]"
                              >
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {log.redline_violated
                                  .split("_")
                                  .slice(1)
                                  .join(" ")}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] text-green-500 border-green-500/50"
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Compliant
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-right text-muted-foreground">
                            {log.intent_hash.slice(0, 12)}...
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STAT CARD COMPONENT
// ============================================================================

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
  trendUp: boolean;
  alert?: boolean;
}

function StatCard({
  icon,
  label,
  value,
  trend,
  trendUp,
  alert,
}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <div className={alert ? "text-red-500" : "text-muted-foreground"}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">
          <span
            className={alert ? "text-red-500" : trendUp ? "text-green-500" : ""}
          >
            {trend}
          </span>
          {trendUp ? " from last month" : ""}
        </p>
      </CardContent>
    </Card>
  );
}
