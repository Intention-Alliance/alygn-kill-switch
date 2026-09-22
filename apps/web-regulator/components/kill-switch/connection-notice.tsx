"use client";

import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConnectionNoticeProps {
  isConnected: boolean;
  reconnectAttempt?: number;
  className?: string;
}

/**
 * WebSocket connection banner — unified across the dashboard.
 *
 * Previously duplicated four times (kill-switch page, dashboard-tabs,
 * flags page, machines page). This is the single implementation, using the
 * Wifi/WifiOff icon pair.
 */
export function ConnectionNotice({
  isConnected,
  reconnectAttempt = 0,
  className,
}: ConnectionNoticeProps) {
  if (isConnected) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-md bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Live — WebSocket connected</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-2 text-sm text-amber-600 dark:text-amber-400",
        className,
      )}
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      <span>
        WS disconnected
        {reconnectAttempt > 0 ? ` (retry ${reconnectAttempt}/5)` : ""}, using
        polling fallback
      </span>
    </div>
  );
}
