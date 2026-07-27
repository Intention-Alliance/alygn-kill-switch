"use client";

import { cn } from "@/lib/utils";
import type { SecretsLoaderHealth } from "@/types/secrets";

interface StatusBarProps {
  health: SecretsLoaderHealth;
  className?: string;
}

export function StatusBar({ health, className }: StatusBarProps) {
  const cells: { label: string; value: React.ReactNode; tone?: "success" | "destructive" | "muted" }[] =
    [
      {
        label: "fs.watch",
        value: health.fsWatch,
        tone: health.fsWatch === "ok" ? "success" : "destructive",
      },
      { label: "SIGHUP", value: health.sighup, tone: "muted" },
      {
        label: "last poll",
        value: formatAge(health.lastPollAt),
        tone: "muted",
      },
      {
        label: "next poll in",
        value: formatSeconds(health.nextPollInSeconds),
        tone: "muted",
      },
    ];

  if (health.lockouts > 0) {
    cells.push({ label: "lockouts", value: health.lockouts, tone: "destructive" });
  }

  return (
    <div
      className={cn(
        "flex h-9 items-center gap-3 border-t bg-card px-4 text-xs font-mono text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {cells.map((cell, i) => (
        <span key={cell.label} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/50" aria-hidden="true">·</span>}
          <span className="text-muted-foreground/80">{cell.label}:</span>
          <span
            className={cn(
              cell.tone === "success" && "text-success",
              cell.tone === "destructive" && "text-destructive",
            )}
          >
            {cell.value}
          </span>
        </span>
      ))}
    </div>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
