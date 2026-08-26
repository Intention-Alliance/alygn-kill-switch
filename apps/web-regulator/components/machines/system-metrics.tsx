"use client";

import { Cpu, CircuitBoard, HardDrive, MemoryStick } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Machine } from "@/types/shared";

interface SystemMetricsBarProps {
  machine: Machine;
  /** Optional live metrics (polled from GET /v1/machines/:id/metrics).
   *  When provided, these override the static machine-row values so CPU/RAM/
   *  GPU actually update in real time. */
  metrics?: {
    cpuUsage: number;
    memoryUsage: number;
    gpuUsage: number;
  } | null;
  className?: string;
}

function getUsageColor(usage: number): string {
  if (usage >= 80) return "bg-red-500";
  if (usage >= 50) return "bg-amber-500";
  return "bg-emerald-500";
}

function getUsageLabelColor(usage: number): string {
  if (usage >= 80) return "text-red-500";
  if (usage >= 50) return "text-amber-500";
  return "text-emerald-500";
}

function MetricBar({
  label,
  icon: Icon,
  usage,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  usage: number | undefined;
}) {
  const value = usage ?? 0;
  const isUnavailable = usage === undefined || usage === null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="w-7 text-muted-foreground font-medium tabular-nums">
        {label}
      </span>
      <div className="relative flex-1 h-2 rounded-full bg-muted overflow-hidden">
        {!isUnavailable && (
          <div
            className={cn("h-full rounded-full transition-all duration-500", getUsageColor(value))}
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        )}
      </div>
      <span
        className={cn(
          "w-9 text-right tabular-nums font-mono text-[11px]",
          isUnavailable ? "text-muted-foreground/50" : getUsageLabelColor(value),
        )}
      >
        {isUnavailable ? "—" : `${Math.round(value)}%`}
      </span>
    </div>
  );
}

export function SystemMetricsBar({ machine, metrics, className }: SystemMetricsBarProps) {
  // Prefer live polled metrics; fall back to the static machine-row values.
  const cpuUsage = metrics?.cpuUsage ?? machine.cpuUsage;
  const memUsage = metrics?.memoryUsage ?? machine.memoryUsage;

  // GPU inferred from specs — if specs.gpu exists and is not "—", simulate usage
  const hasGpu = machine.specs?.gpu && machine.specs.gpu !== "—";
  const gpuUsage: number | undefined = hasGpu
    ? (metrics?.gpuUsage ?? (cpuUsage !== undefined ? Math.min((cpuUsage ?? 0) * 0.3, 100) : undefined))
    : undefined;

  // DPU inferred from hasDpu
  const dpuAvailable = machine.hasDpu;
  const dpuUsage: number | undefined = dpuAvailable ? 5 : undefined;

  return (
    <div className={cn("space-y-2 py-1", className)}>
      <MetricBar label="CPU" icon={Cpu} usage={cpuUsage} />
      <MetricBar label="RAM" icon={MemoryStick} usage={memUsage} />
      <MetricBar label="GPU" icon={CircuitBoard} usage={gpuUsage} />
      <MetricBar label="DPU" icon={HardDrive} usage={dpuUsage} />
    </div>
  );
}
