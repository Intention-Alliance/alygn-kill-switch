"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Server, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineDetailPanel } from "@/components/machines/machine-detail-panel";
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import { apiGet, apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import type { Machine, KillSwitchState } from "@/types/shared";

interface MachineResponse {
  data: Machine;
}

function MachineDetailContent({ machineId }: { machineId: string }) {
  const { status, auditLog } = useKillSwitchWebSocket();
  const [machine, setMachine] = useState<Machine | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch machine data
  useEffect(() => {
    let cancelled = false;

    async function fetchMachine() {
      try {
        const response = await apiGet<MachineResponse>(
          `/api/machines/${machineId}`,
        );
        if (!cancelled) {
          setMachine(response.data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to fetch machine",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchMachine();
    return () => {
      cancelled = true;
    };
  }, [machineId]);

  // Kill switch state change handler
  const handleKillSwitchStateChange = useCallback(
    async (newState: KillSwitchState) => {
      try {
        const result = await apiPost<{
          current: KillSwitchState;
          previous: KillSwitchState;
          timestamp: number;
        }>("/api/kill-switch/chaos", {
          state: newState,
          reason: `Machine detail page override: ${newState}`,
        });
        toast.success(`State changed to ${result.current}`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to change state";
        toast.error(message);
      }
    },
    [],
  );

  // ─── Loading State ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          Loading machine details…
        </p>
      </div>
    );
  }

  // ─── Error State ───────────────────────────────────────────────

  if (error || !machine) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Server className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {error ?? "Machine not found"}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-8">
          <Link href="/">
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Link>
        </Button>
      </div>

      <MachineDetailPanel
        machine={machine}
        onClose={() => {
          // Navigate back to dashboard
          window.history.back();
        }}
        auditLog={auditLog}
        currentKillSwitchState={status?.state ?? "ARMED"}
        onKillSwitchStateChange={handleKillSwitchStateChange}
      />
    </div>
  );
}

export default function MachineDetailPage() {
  const params = useParams<{ id: string }>();
  const machineId = params.id;

  return (
    <div className="p-4 md:p-8">
      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Loading machine…
            </p>
          </div>
        }
      >
        <MachineDetailContent machineId={machineId} />
      </Suspense>
    </div>
  );
}
