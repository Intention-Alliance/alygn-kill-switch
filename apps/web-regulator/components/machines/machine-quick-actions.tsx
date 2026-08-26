"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Shield,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import type { KillSwitchState } from "@/types/shared";

interface MachineQuickActionsProps {
  currentState: KillSwitchState;
  onStateChange: (state: KillSwitchState) => void;
  className?: string;
}

const CONFIRM_PHRASE = "STOP ALL CHAOS";

export function MachineQuickActions({
  currentState,
  onStateChange,
  className,
}: MachineQuickActionsProps) {
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitStateChange(state: KillSwitchState) {
    setIsSubmitting(true);

    try {
      const result = await apiPost<{
        current: KillSwitchState;
        previous: KillSwitchState;
        timestamp: number;
      }>("/api/kill-switch/chaos", {
        state,
        reason: `Machine-level override via dashboard: ${state}`,
      });

      toast.success(`State changed to ${result.current}`);
      onStateChange(result.current);
      setIsConfirmOpen(false);
      setConfirmPhrase("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to change state";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function openStop() {
    setConfirmPhrase("");
    setIsConfirmOpen(true);
  }

  const isStopped = currentState === "STOPPED";
  const isLocked = currentState === "LOCKED";
  const isArmed = currentState === "ARMED";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <h3 className="text-sm font-semibold text-foreground">Quick Actions</h3>

      <div className="flex flex-col gap-2">
        {isLocked ? (
          <Button
            variant="default"
            size="lg"
            disabled
            className="w-full min-h-12"
          >
            <Shield className="mr-2 size-5" />
            System Locked
          </Button>
        ) : isStopped ? (
          <Button
            variant="default"
            size="lg"
            onClick={() => submitStateChange("ARMED")}
            disabled={isSubmitting}
            className="w-full min-h-12"
          >
            <Shield className="mr-2 size-5" />
            {isSubmitting ? "Arming…" : "ARM & RELEASE"}
          </Button>
        ) : (
          <>
            <Button
              variant="destructive"
              size="lg"
              onClick={openStop}
              disabled={isSubmitting}
              className="w-full min-h-12 text-base font-semibold shadow-sm"
            >
              <AlertTriangle className="mr-2 size-5" />
              {isSubmitting ? "Stopping…" : "EMERGENCY STOP"}
            </Button>

            {isArmed && (
              <Button
                variant="default"
                size="lg"
                onClick={() => submitStateChange("RUNNING")}
                disabled={isSubmitting}
                className="w-full min-h-12"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 size-5 animate-spin" />
                ) : (
                  <Play className="mr-2 size-5" />
                )}
                RUN
              </Button>
            )}
          </>
        )}
      </div>

      {/* Confirmation Dialog — same pattern as EmergencyStopButton */}
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Emergency Stop Confirmation
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You are about to trigger an{" "}
                <strong>EMERGENCY STOP</strong>. This will immediately halt all
                active experiments and lock the system.
              </p>
              <div className="rounded-md bg-destructive/10 p-3 text-sm">
                <p className="font-semibold text-destructive">
                  ⚠️ Type the confirmation phrase to proceed:
                </p>
                <p className="mt-1 font-mono text-base">{CONFIRM_PHRASE}</p>
              </div>
              <Input
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="Type confirmation phrase…"
                className="font-mono"
                autoFocus
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                submitStateChange("STOPPED");
              }}
              disabled={confirmPhrase !== CONFIRM_PHRASE || isSubmitting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Activating…
                </>
              ) : (
                "Confirm Emergency Stop"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
