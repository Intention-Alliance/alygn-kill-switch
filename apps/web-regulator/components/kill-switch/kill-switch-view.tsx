"use client";

import { Shield, Activity, Loader2 } from "lucide-react";
import { SectionErrorBoundary } from "@/components/error-boundary";
import { StatusIndicator } from "@/components/kill-switch/status-indicator";
import { EmergencyStopButton } from "@/components/kill-switch/emergency-stop-button";
import { ActivationHistory } from "@/components/kill-switch/activation-history";
import { InferenceLogs } from "@/components/kill-switch/inference-logs";
import { ConnectionNotice } from "@/components/kill-switch/connection-notice";
import { ResumeButton } from "@/components/kill-switch/resume-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { BRAND_NAME } from "@/lib/branding";
import type {
  ActivationRecord,
  KillSwitchState,
  KillSwitchStatus,
} from "@/types/shared";

/**
 * Kill Switch view — THE single implementation of the kill-switch surface.
 *
 * S5 requirement: `/kill-switch` and `/?tab=kill-switch` must render the same
 * components. Both hosts mount this component; the tab-local copies
 * (KillSwitchTab / ResumeButton / ConnectionNotice) were deleted.
 *
 * Presentational only: it receives state via props and never calls
 * useKillSwitchWebSocket, so both routes provably share one implementation.
 *
 * Wrapper-free — it renders `space-y-6` and nothing more; each host supplies
 * its own outer padding.
 */

export const KILL_SWITCH_SECTIONS = [
  "connection-notice",
  "header",
  "verification-badge",
  "status-card",
  "controls",
  "activation-history",
  "inference-logs",
] as const;

export interface KillSwitchViewProps {
  status: KillSwitchStatus | null;
  auditLog: ActivationRecord[];
  isConnected: boolean;
  reconnectAttempt: number;
  onStateChange: (state: KillSwitchState) => void;
  className?: string;
}

export function KillSwitchView({
  status,
  auditLog,
  isConnected,
  reconnectAttempt,
  onStateChange,
  className,
}: KillSwitchViewProps) {
  const isLoading = !status;

  if (isLoading && !isConnected) {
    return (
      <div className={className ?? "space-y-6"}>
        <Skeleton className="h-10 w-64" />
        <div
          className="rounded-lg border border-muted bg-muted/30 p-6 text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2
            className="mx-auto h-8 w-8 motion-safe:animate-spin text-primary"
            aria-hidden="true"
          />
          <h2 className="mt-4 text-lg font-semibold">
            Connecting to Kill Switch…
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Attempting WebSocket connection (attempt{" "}
            {reconnectAttempt > 0 ? reconnectAttempt : 1}
            /5)
          </p>
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className={className ?? "space-y-6"}>
      {/* WebSocket Connection Notice */}
      <ConnectionNotice
        isConnected={isConnected}
        reconnectAttempt={reconnectAttempt}
      />

      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight">
              Kill Switch Dashboard
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Emergency shutdown control for the {BRAND_NAME} protocol network
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          {status && (
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm text-muted-foreground">
                Active experiments: {status.activeExperiments}
              </span>
            </div>
          )}

          {status && status.verificationEnabled !== undefined && (
            <Badge
              variant={status.verificationEnabled ? "default" : "secondary"}
              className="gap-1.5"
              title={`Verifier model: ${status.verifierModel ?? "unknown"} · mode: ${status.verificationMode ?? "async"}`}
            >
              <Shield className="h-3 w-3" aria-hidden="true" />
              Verification: {status.verificationEnabled ? "ON" : "OFF"}
              {status.verificationEnabled && status.verificationMode && (
                <span className="text-[10px] opacity-80">
                  ({status.verificationMode})
                </span>
              )}
            </Badge>
          )}
        </div>
      </div>

      <Separator />

      {/* Status Card */}
      <SectionErrorBoundary title="Status Overview">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-3 text-lg">
              System Status
              {status && <StatusIndicator state={status.state} />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md border p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Last Activation
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {status?.lastActivation
                    ? new Date(status.lastActivation).toLocaleString()
                    : "Never"}
                </p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Activated By
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {status?.lastActivationBy ?? "—"}
                </p>
              </div>
              <div className="rounded-md border p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Reason
                </p>
                <p className="mt-1 text-sm font-semibold line-clamp-2">
                  {status?.reason ?? "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </SectionErrorBoundary>

      {/* Emergency Stop Controls */}
      <SectionErrorBoundary title="Controls">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Controls</CardTitle>
          </CardHeader>
          <CardContent>
            {status ? (
              <div className="space-y-4">
                <EmergencyStopButton
                  currentState={status.state}
                  onStateChange={onStateChange}
                />
                {status.state === "STOPPED" && (
                  <ResumeButton onResumed={() => onStateChange("RUNNING")} />
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Status unavailable — controls disabled.
              </p>
            )}
          </CardContent>
        </Card>
      </SectionErrorBoundary>

      {/* Activation History */}
      <SectionErrorBoundary title="Activation History">
        <ActivationHistory limit={20} webSocketRecords={auditLog} />
      </SectionErrorBoundary>

      {/* Inference Logs — intercepted requests reported by agent-plane */}
      <SectionErrorBoundary title="Inference Logs">
        <InferenceLogs limit={25} />
      </SectionErrorBoundary>
    </div>
  );
}
