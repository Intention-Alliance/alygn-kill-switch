"use client";

import { useCallback } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { KillSwitchView } from "@/components/kill-switch/kill-switch-view";
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import type { KillSwitchState } from "@/types/shared";

/**
 * `/kill-switch` route.
 *
 * Renders the shared KillSwitchView — the same component the
 * `/?tab=kill-switch` tab mounts (S5 requirement). All the section markup,
 * ResumeButton and ConnectionNotice now live in the shared components; this
 * page only wires state and the no-op state-change callback.
 */
export default function KillSwitchDashboardPage() {
  const { status, auditLog, isConnected, reconnectAttempt } =
    useKillSwitchWebSocket();

  const handleStateChange = useCallback((_newState: KillSwitchState) => {
    // Status updates propagate via WebSocket; no manual set needed.
  }, []);

  return (
    <ErrorBoundary>
      <KillSwitchView
        status={status}
        auditLog={auditLog}
        isConnected={isConnected}
        reconnectAttempt={reconnectAttempt}
        onStateChange={handleStateChange}
      />
    </ErrorBoundary>
  );
}
