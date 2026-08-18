"use client";

import { cn } from "@/lib/utils";
import type { ActivationRecord, KillSwitchState } from "@/types/shared";
import { computeNetworkLoad } from "@/lib/dashboard-utils";

interface SystemHealthPanelProps {
  auditLog: ActivationRecord[];
  killSwitchState: KillSwitchState | null;
  pausedRequestCount?: number;
}

export function SystemHealthPanel({
  auditLog,
  killSwitchState,
  pausedRequestCount = 0,
}: SystemHealthPanelProps) {
  const networkLoadPercent = computeNetworkLoad(killSwitchState);

  const loadLabel =
    !killSwitchState ? "Unknown"
    : killSwitchState === "RUNNING" ? "Elevated"
    : killSwitchState === "ARMED" ? "Normal"
    : killSwitchState === "STOPPING" || killSwitchState === "STOPPED" ? "Low"
    : "Critical";

  const isPaused = killSwitchState !== null && killSwitchState !== "RUNNING";

  return (
    <div className="border border-border/50 bg-card/30 rounded-xl p-6 backdrop-blur-md space-y-6">
      {/* System Health */}
      <div className="space-y-2">
        <h3 className="font-semibold text-lg">System Health</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          All ALYGN nodes are currently reporting within nominal parameters.
          Average kill-switch latency is performing at 140% above target threshold.
        </p>
      </div>

      {/* Network Load Bar */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground font-medium">Network Load</span>
          <span className="font-bold text-primary">{loadLabel}</span>
        </div>
        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${networkLoadPercent}%` }}
          />
        </div>
      </div>

      {/* Paused Request Count — shown when traffic is paused (ADR-141) */}
      {isPaused && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-sm font-medium text-destructive">
              Inference traffic paused
            </span>
          </div>
          <span className="text-sm font-bold text-destructive">
            {pausedRequestCount} request{pausedRequestCount === 1 ? "" : "s"} held
          </span>
        </div>
      )}

      <div className="h-px w-full bg-border/50" />

      {/* Recent Security Events */}
      <div className="space-y-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Recent Security Events
        </h4>
        <div className="space-y-3">
          {auditLog.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No recent events</p>
          ) : (
            auditLog.slice(0, 3).map((log) => (
              <div
                key={log.id}
                className="flex items-start gap-3 p-2 rounded-lg bg-background/50 border border-border/30"
              >
                <div
                  className={cn(
                    "mt-1.5 size-2 rounded-full",
                    log.newState === "STOPPED" || log.newState === "LOCKED"
                      ? "bg-destructive animate-pulse"
                      : "bg-green-500",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">
                    {log.reason || "Standard Inference Verification"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
