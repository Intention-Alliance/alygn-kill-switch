"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield, Activity } from "lucide-react";
import { ErrorBoundary, SectionErrorBoundary } from "@/components/error-boundary";
import { StatusIndicator } from "@/components/kill-switch/status-indicator";
import { EmergencyStopButton } from "@/components/kill-switch/emergency-stop-button";
import { ActivationHistory } from "@/components/kill-switch/activation-history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { apiGet } from "@/lib/api-client";
import type { KillSwitchState, KillSwitchStatus } from "@/types/shared";

export default function KillSwitchDashboardPage() {
  const [status, setStatus] = useState<KillSwitchStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiGet<KillSwitchStatus>("/api/kill-switch/status");
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch status");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Poll every 5s for real-time updates
    const interval = setInterval(fetchStatus, 5_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleStateChange = useCallback(
    (newState: KillSwitchState) => {
      setStatus((prev) =>
        prev ? { ...prev, state: newState } : prev,
      );
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
        <Shield className="mx-auto h-10 w-10 text-destructive/50" />
        <h2 className="mt-4 text-lg font-semibold text-destructive">
          Failed to Load Kill Switch
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
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
              Emergency shutdown control for the ALYGN protocol network
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
                <EmergencyStopButton
                  currentState={status.state}
                  onStateChange={handleStateChange}
                />
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
          <ActivationHistory limit={20} />
        </SectionErrorBoundary>
      </div>
    </ErrorBoundary>
  );
}
