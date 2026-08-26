"use client";

import { useState } from "react";
import { Shield, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface EmergencyStopButtonProps {
  currentState: KillSwitchState;
  onStateChange: (newState: KillSwitchState) => void;
  className?: string;
}

const CONFIRM_PHRASE = "STOP ALL CHAOS";

export function EmergencyStopButton({
  currentState,
  onStateChange,
  className,
}: EmergencyStopButtonProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [targetState, setTargetState] = useState<KillSwitchState | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  function openActivationDialog(action: KillSwitchState) {
    if (action === "STOPPED") {
      setTargetState("STOPPED");
      setIsConfirmOpen(true);
    } else {
      setTargetState(action);
      setIsDialogOpen(true);
    }
  }

  async function submitStateChange(state?: KillSwitchState) {
    const nextState = state ?? targetState;
    if (!nextState) return;
    setIsSubmitting(true);

    try {
      const result = await apiPost<{
        current: KillSwitchState;
        previous: KillSwitchState;
        timestamp: number;
      }>("/api/kill-switch/chaos", {
        state: nextState,
        reason: `Manual override via dashboard: ${nextState}`,
      });

      toast.success(`State changed to ${result.current}`);
      onStateChange(result.current);
      setIsDialogOpen(false);
      setIsConfirmOpen(false);
      setConfirmPhrase("");
      setTargetState(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to change state";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {currentState === "STOPPED" ? (
          <Button
            variant="default"
            size="lg"
            onClick={() => submitStateChange("ARMED")}
            disabled={isSubmitting}
            className="w-full min-h-12 sm:w-auto"
          >
            <Shield className="mr-2 h-5 w-5" />
            {isSubmitting ? "Activating…" : "ARM & RELEASE"}
          </Button>
        ) : currentState === "LOCKED" ? (
          <Button variant="default" size="lg" disabled className="w-full min-h-12 sm:w-auto">
            <Shield className="mr-2 h-5 w-5" />
            System Locked
          </Button>
        ) : (
          <>
            <Button
              variant="destructive"
              size="lg"
              onClick={() => openActivationDialog("STOPPED")}
              disabled={isSubmitting}
              className="w-full min-h-12 text-base font-semibold shadow-sm sm:w-auto"
            >
              <AlertTriangle className="mr-2 h-5 w-5" />
              {isSubmitting ? "Activating…" : "EMERGENCY STOP"}
            </Button>

            {currentState === "ARMED" && (
              <Button
                variant="default"
                size="lg"
                onClick={() => submitStateChange("RUNNING")}
                disabled={isSubmitting}
                className="w-full min-h-12 sm:w-auto"
              >
                <Loader2
                  className={cn(
                    "mr-2 h-5 w-5",
                    isSubmitting && "animate-spin",
                  )}
                />
                RUN
              </Button>
            )}
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              Emergency Stop Confirmation
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You are about to trigger an <strong>EMERGENCY STOP</strong>.
                This will immediately halt all active experiments and lock the
                system.
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
                submitStateChange();
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

      {/* Reason Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change System State</DialogTitle>
            <DialogDescription>
              You are about to transition the system to{" "}
              <strong>{targetState}</strong>. Please provide a reason.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Input id="reason" placeholder="Administrative override…" />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={() => submitStateChange()} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying…
                </>
              ) : (
                `Set ${targetState}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


