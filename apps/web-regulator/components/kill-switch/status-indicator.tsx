"use client";

import { cn } from "@/lib/utils";
import type { KillSwitchState } from "@/types/shared";

interface StatusIndicatorProps {
  state: KillSwitchState;
  className?: string;
}

const STATE_CONFIG: Record<
  KillSwitchState,
  { label: string; color: string; bgClass: string; pulse: boolean }
> = {
  ARMED: {
    label: "Armed",
    color: "text-emerald-500",
    bgClass: "bg-emerald-500/10 border-emerald-500/30",
    pulse: false,
  },
  RUNNING: {
    label: "Running",
    color: "text-blue-500",
    bgClass: "bg-blue-500/10 border-blue-500/30",
    pulse: true,
  },
  STOPPING: {
    label: "Stopping",
    color: "text-amber-500",
    bgClass: "bg-amber-500/10 border-amber-500/30",
    pulse: true,
  },
  STOPPED: {
    label: "Stopped",
    color: "text-red-500",
    bgClass: "bg-red-500/10 border-red-500/30",
    pulse: false,
  },
  LOCKED: {
    label: "Locked",
    color: "text-slate-500",
    bgClass: "bg-slate-500/10 border-slate-500/30",
    pulse: false,
  },
};

export function StatusIndicator({ state, className }: StatusIndicatorProps) {
  const config = STATE_CONFIG[state] ?? STATE_CONFIG.ARMED;

  return (
    <div
      className={cn("flex items-center gap-2", className)}
      aria-live="polite"
      role="status"
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-block h-2.5 w-2.5 rounded-full",
            config.color.replace("text-", "bg-"),
            config.pulse && "motion-safe:animate-pulse",
          )}
          aria-hidden="true"
        />
        <span className={cn("text-sm font-semibold", config.color)}>
          {config.label}
        </span>
      </div>
    </div>
  );
}
