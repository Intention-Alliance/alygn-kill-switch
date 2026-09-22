"use client";

import { useCallback, useState } from "react";
import { Shield, Activity, Wifi, WifiOff, Loader2, Play } from "lucide-react";
import { ErrorBoundary, SectionErrorBoundary } from "@/components/error-boundary";
import { StatusIndicator } from "@/components/kill-switch/status-indicator";
import { EmergencyStopButton } from "@/components/kill-switch/emergency-stop-button";
import { ActivationHistory } from "@/components/kill-switch/activation-history";
import { InferenceLogs } from "@/components/kill-switch/inference-logs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api-client";
import { BRAND_NAME } from "@/lib/branding";
import { toast } from "sonner";
import type { KillSwitchState } from "@/types/shared";

export default function KillSwitchDashboardPage() {
  const {
    status,
    auditLog,
    isConnected,
    reconnectAttempt,
  } = useKillSwitchWebSocket();

  const isLoading = !status;

  const handleStateChange = useCallback(
    (newState: KillSwitchState) => {
      // Status updates happen via WebSocket, no need to manually set
    },
    [],
  );

  if (isLoading && !isConnected) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        {/* Connecting indicator */}
        <div
          className="rounded-lg border border-muted bg-muted/30 p-6 text-center"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="mx-auto h-8 w-8 motion-safe:animate-spin text-primary" aria-hidden="true" />
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
    <ErrorBoundary>
      <div className="space-y-6">
        {/* WebSocket Connection Notice */}
        <ConnectionNotice
          isConnected={isConnected}
          reconnectAttempt={reconnectAttempt}
        />

        {/* Page Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">
                Kill Switch Dashboard
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Emergency shutdown control for the {BRAND_NAME} protocol network
            </p>
          </div>

          {status && (
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
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
              Verification:{" "}
              {status.verificationEnabled ? "ON" : "OFF"}
              {status.verificationEnabled && status.verificationMode && (
                <span className="text-[10px] opacity-80">
                  ({status.verificationMode})
                </span>
              )}
            </Badge>
          )}
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
                    onStateChange={handleStateChange}
                  />
                  {status.state === "STOPPED" && (
                    <ResumeButton
                      onResumed={() => handleStateChange("RUNNING")}
                    />
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

        {/* Activation History — uses WebSocket auditLog */}
        <SectionErrorBoundary title="Activation History">
          <ActivationHistory
            limit={20}
            webSocketRecords={auditLog}
          />
        </SectionErrorBoundary>

        {/* Inference Logs — intercepted requests reported by agent-plane */}
        <SectionErrorBoundary title="Inference Logs">
          <InferenceLogs limit={25} />
        </SectionErrorBoundary>
      </div>
    </ErrorBoundary>
  );
}

// ─── Resume Button ────────────────────────────────────────────────

function ResumeButton({ onResumed }: { onResumed: () => void }) {
  const [isResuming, setIsResuming] = useState(false);

  const handleResume = useCallback(async () => {
    setIsResuming(true);
    try {
      await apiPost("/api/kill-switch/chaos", {
        state: "RUNNING",
        reason: "Manual resume from dashboard",
      });
      toast.success("Kill Switch resumed — inference traffic flowing");
      onResumed();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to resume kill switch",
      );
    } finally {
      setIsResuming(false);
    }
  }, [onResumed]);

  return (
    <Button
      onClick={handleResume}
      disabled={isResuming}
      variant="default"
      className="w-full sm:w-auto"
      aria-label="Resume inference traffic"
    >
      {isResuming ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Resuming…
        </>
      ) : (
        <>
          <Play className="mr-2 h-4 w-4" aria-hidden="true" />
          Resume Inference Traffic
        </>
      )}
    </Button>
  );
}

// ─── Connection Notice ───────────────────────────────────────────

function ConnectionNotice({
  isConnected,
  reconnectAttempt,
}: {
  isConnected: boolean;
  reconnectAttempt: number;
}) {
  if (isConnected) {
    return (
      <div
        className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400"
        role="status"
        aria-live="polite"
      >
        <Wifi className="h-3.5 w-3.5" />
        <span>Live — WebSocket connected</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-2 text-sm text-amber-600 dark:text-amber-400"
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>
        WS disconnected{reconnectAttempt > 0
          ? ` (retry ${reconnectAttempt}/5)`
          : ""}
        , using polling fallback
      </span>
    </div>
  );
}
