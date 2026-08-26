"use client";

import { useState } from "react";
import { Shield, Skull, Loader2 } from "lucide-react";
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

/**
 * Big rounded red "Kill" button styled like a physical emergency button
 * emerging from the surface. Uses layered box-shadows for a 3D "raised"
 * look and a press-down transform on :active so it feels like a real
 * button you push.
 */
export function KillButton({
  onClick,
  disabled,
  submitting,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  submitting?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || submitting}
      aria-label="Kill — trigger emergency stop"
      className={cn(
        // Base: big, fully rounded, blood-red with a radial highlight so it
        // reads as a physical mushroom-style emergency button.
        "group relative inline-flex w-full items-center justify-center gap-2.5",
        "rounded-full px-8 py-5 text-lg font-black uppercase tracking-widest",
        "text-white select-none transition-all duration-150",
        // 3D emergence: a darker "base" ring beneath + layered shadows that
        // lift the button off the surface.
        "bg-gradient-to-b from-red-500 via-red-600 to-red-700",
        "shadow-[0_10px_0_0_#7f1d1d,0_16px_24px_-6px_rgba(0,0,0,0.6),inset_0_2px_0_0_rgba(255,255,255,0.35),inset_0_-6px_12px_0_rgba(0,0,0,0.35)]",
        "ring-4 ring-red-900/40 ring-offset-2 ring-offset-background",
        "hover:brightness-110 hover:shadow-[0_12px_0_0_#7f1d1d,0_20px_28px_-6px_rgba(0,0,0,0.65),inset_0_2px_0_0_rgba(255,255,255,0.4),inset_0_-6px_12px_0_rgba(0,0,0,0.35)]",
        // Press-down: the button sinks into its base when clicked.
        "active:translate-y-[6px] active:shadow-[0_4px_0_0_#7f1d1d,0_8px_12px_-4px_rgba(0,0,0,0.5),inset_0_2px_0_0_rgba(255,255,255,0.25),inset_0_-4px_8px_0_rgba(0,0,0,0.4)]",
        "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-500",
        "disabled:pointer-events-none disabled:opacity-60 disabled:translate-y-0 disabled:shadow-[0_10px_0_0_#7f1d1d,0_16px_24px_-6px_rgba(0,0,0,0.6),inset_0_2px_0_0_rgba(255,255,255,0.35),inset_0_-6px_12px_0_rgba(0,0,0,0.35)]",
        className,
      )}
    >
      <Skull
        className={cn(
          "size-7 shrink-0 drop-shadow-[0_2px_2px_rgba(0,0,0,0.4)]",
          submitting && "animate-pulse",
        )}
        aria-hidden="true"
      />
      <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.4)]">
        {submitting ? "Killing…" : "Kill"}
      </span>
    </button>
  );
}

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
            <KillButton
              onClick={() => openActivationDialog("STOPPED")}
              disabled={isSubmitting}
              submitting={isSubmitting}
              className="sm:w-auto sm:min-w-[220px]"
            />

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
              Kill Confirmation
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You are about to trigger a <strong>KILL</strong>. This will
                immediately halt all active experiments and lock the system.
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
                  Killing…
                </>
              ) : (
                "Confirm Kill"
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


