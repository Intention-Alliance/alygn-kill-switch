"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { MachineSidebar } from "@/components/machines/machine-sidebar";
import { MachineLogs } from "@/components/machines/machine-logs";
import { DPUSecurityBanner } from "@/components/machines/dpu-security-banner";
import { StatCard } from "@/components/dashboard/stat-card";
import { apiGet } from "@/lib/api-client";
import type { Machine, ActivationRecord, KillSwitchState } from "@/types/shared";

interface MachineDetailPanelProps {
  machine: Machine;
  onClose: () => void;
  auditLog: ActivationRecord[];
  currentKillSwitchState: KillSwitchState;
  onKillSwitchStateChange: (state: KillSwitchState) => void;
}

// ─── Live metrics API response shape ────────────────────────────────
// GET /v1/machines/:id/metrics → real-time host telemetry
interface MachineMetricsResponse {
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage: number;
  gpuModel: string;
  dpuStatus: string;
  loadAvg: number;
  uptime: number;
  diskUsage: number;
  timestamp: string;
}

const METRICS_POLL_INTERVAL_MS = 5_000; // refresh live stats every 5s

const MACHINE_STATUS_CONFIG: Record<
  Machine["status"],
  { label: string; variant: "default" | "destructive" | "outline" }
> = {
  active: { label: "Active", variant: "default" },
  inactive: { label: "Inactive", variant: "outline" },
  offline: { label: "Offline", variant: "destructive" },
  pending: { label: "Pending", variant: "outline" },
};

export function MachineDetailPanel({
  machine,
  onClose,
  auditLog,
  currentKillSwitchState,
  onKillSwitchStateChange,
}: MachineDetailPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // Live metrics — seeded from the machine row, then refreshed by polling
  // GET /v1/machines/:id/metrics every 5s so CPU/RAM/GPU actually update.
  const [liveMetrics, setLiveMetrics] = useState<MachineMetricsResponse | null>(
    null,
  );

  // Trigger slide-in animation on mount
  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // Poll live system metrics every 5s (Bug: machine stats were static).
  useEffect(() => {
    let cancelled = false;

    async function pollMetrics() {
      try {
        const res = await apiGet<MachineMetricsResponse>(
          `/api/machines/${encodeURIComponent(machine.id)}/metrics`,
        );
        if (!cancelled) setLiveMetrics(res);
      } catch {
        // Metrics endpoint may be unavailable — keep the last known values.
      }
    }

    pollMetrics();
    const interval = setInterval(pollMetrics, METRICS_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [machine.id]);

  function handleClose() {
    setIsVisible(false);
    setTimeout(onClose, 300);
  }

  const statusConfig = MACHINE_STATUS_CONFIG[machine.status] ?? {
    label: machine.status,
    variant: "outline" as const,
  };

  // Prefer live polled metrics; fall back to the (static) machine row values.
  const cpuValue = liveMetrics?.cpuUsage ?? machine.cpuUsage ?? 0;
  const memValue = liveMetrics?.memoryUsage ?? machine.memoryUsage ?? 0;

  // Audit log violations count (STOPPED or LOCKED transitions)
  const violations = auditLog.filter(
    (e) => e.newState === "STOPPED" || e.newState === "LOCKED",
  ).length;

  return (
    <div
      ref={panelRef}
      className={cn(
        "space-y-6",
        "transition-all duration-300 ease-in-out",
        isVisible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2",
      )}
    >
      {/* Header */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="-ml-2 h-8"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <Badge
            variant="outline"
            className="text-xs font-mono tracking-tighter opacity-70"
          >
            ID: {machine.id.slice(0, 8)}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-9 rounded-lg bg-primary/10 shrink-0">
            <Server className="size-4 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              {machine.name}
              <Badge
                variant={statusConfig.variant}
                className="capitalize text-[10px] shadow-none"
              >
                {statusConfig.label}
              </Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              {machine.hostname} · Role:{" "}
              <span className="text-foreground font-medium">
                {machine.role}
              </span>
            </p>
          </div>
        </div>
      </header>

      {/* DPU Security Banner */}
      <DPUSecurityBanner
        machineName={machine.name}
        hasDPU={machine.hasDpu}
      />

      {/* Stats Grid — same pattern as ClusterDetails */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Server className="size-4" />}
          label="Machine Latency"
          value={`${cpuValue.toFixed(1)}ms`}
          trend="Real-time"
          trendUp={cpuValue < 20}
        />
        <StatCard
          icon={<Server className="size-4" />}
          label="CPU Usage"
          value={`${Math.round(cpuValue)}%`}
          trend={cpuValue < 50 ? "Normal" : "High Load"}
          trendUp={cpuValue < 50}
        />
        <StatCard
          icon={<Server className="size-4" />}
          label="Memory Usage"
          value={`${Math.round(memValue)}%`}
          trend={memValue < 80 ? "Healthy" : "Warning"}
          trendUp={memValue < 80}
        />
        <StatCard
          icon={<Server className="size-4" />}
          label="Violations"
          value={violations.toLocaleString()}
          trend={violations > 0 ? "Under Review" : "Clean Record"}
          trendUp={!violations}
          alert={violations > 0}
        />
      </div>

      <Separator />

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sidebar — same pattern as ClusterSidebar */}
        <div className="lg:col-span-1">
          <MachineSidebar
            machine={machine}
            currentKillSwitchState={currentKillSwitchState}
            onKillSwitchStateChange={onKillSwitchStateChange}
            metrics={liveMetrics}
          />
        </div>

        {/* Main area — audit log TABLE */}
        <div className="lg:col-span-2">
          <MachineLogs machineId={machine.id} auditLog={auditLog} />
        </div>
      </div>
    </div>
  );
}
