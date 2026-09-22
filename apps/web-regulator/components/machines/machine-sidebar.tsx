"use client";

import { Cpu, HardDrive, MapPin, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { SystemMetricsBar } from "@/components/machines/system-metrics";
import { MachineQuickActions } from "@/components/machines/machine-quick-actions";
import type { Machine, KillSwitchState } from "@/types/shared";

interface MachineSidebarProps {
  machine: Machine;
  currentKillSwitchState: KillSwitchState;
  onKillSwitchStateChange: (state: KillSwitchState) => void;
  /** Optional live metrics (polled from GET /v1/machines/:id/metrics). */
  metrics?: {
    cpuUsage: number;
    memoryUsage: number;
    gpuUsage: number;
  } | null;
}

const MACHINE_STATUS_CONFIG: Record<
  Machine["status"],
  { label: string; variant: "default" | "destructive" | "secondary" }
> = {
  active: { label: "Active", variant: "default" },
  inactive: { label: "Inactive", variant: "secondary" },
  offline: { label: "Offline", variant: "destructive" },
  pending: { label: "Pending", variant: "secondary" },
};

export function MachineSidebar({
  machine,
  currentKillSwitchState,
  onKillSwitchStateChange,
  metrics,
}: MachineSidebarProps) {
  const statusConfig = MACHINE_STATUS_CONFIG[machine.status] ?? {
    label: machine.status,
    variant: "secondary" as const,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Server className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold tracking-tight">
          Machine Detail
        </h2>
      </div>

      {/* Hardware Card */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{machine.name}</CardTitle>
            <Badge
              variant={statusConfig.variant}
              className="capitalize text-[10px]"
            >
              {statusConfig.label}
            </Badge>
          </div>
          <CardDescription className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {machine.hostname}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <Separator className="bg-border/50" />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <Cpu className="h-3 w-3" /> Hardware
              </span>
              <p className="font-medium text-foreground text-xs leading-tight">
                {machine.specs?.gpu && machine.specs.gpu !== "—"
                  ? machine.specs.gpu
                  : "No GPU"}
                {machine.specs?.cpu && (
                  <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                    {machine.specs.cpu} • {machine.specs.ram || "—"}
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <HardDrive className="h-3 w-3" /> DPU
              </span>
              <p
                className={cn(
                  "text-xs font-medium",
                  machine.hasDpu ? "text-emerald-500" : "text-amber-500",
                )}
              >
                {machine.hasDpu
                  ? "BlueField-3"
                  : "Not Available"}
              </p>
            </div>
          </div>

          {/* System Metrics */}
          <Separator className="bg-border/50" />
          <SystemMetricsBar machine={machine} metrics={metrics} />
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <MachineQuickActions
        currentState={currentKillSwitchState}
        onStateChange={onKillSwitchStateChange}
      />
    </div>
  );
}
