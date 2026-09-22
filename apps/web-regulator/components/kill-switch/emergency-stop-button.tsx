"use client";

import { useState } from "react";
import { Shield, Skull, Loader2 } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
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
import type {
  Fido2AssertBeginResponse,
  Fido2AssertFinishResponse,
} from "@/types/fido2";

interface EmergencyStopButtonProps {
  currentState: KillSwitchState;
  onStateChange: (newState: KillSwitchState) => void;
  className?: string;
}

const CONFIRM_PHRASE = "STOP ALL CHAOS";

/**
 * Big rounded red "Kill" button styled like a physical emergency button
 * emerging from the surface.
 *
 * 3D construction (Bug fix): the shadow / "base" lives on a SEPARATE
 * wrapper element that stays fixed, while the button itself translates down
 * on :active. This makes the button sink INTO its base on press instead of
 * dragging the shadow along with it (which previously looked like the whole
 * button + shadow moving together and being shifted a few px at the bottom).
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
    <div className={cn("group relative", className)}>
      {/*
        Pedestal / base — the fixed "shadow" beneath the button.
        Extends 6px below the button so the button has room to sink into it
        on press. This element NEVER moves; only the button translates.
      */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 bottom-[-6px]",
          "rounded-full bg-red-950/90",
          "shadow-[0_10px_0_0_#7f1d1d,0_16px_24px_-6px_rgba(0,0,0,0.6)]",
          "transition-shadow duration-150",
          "group-hover:shadow-[0_12px_0_0_#7f1d1d,0_20px_28px_-6px_rgba(0,0,0,0.65)]",
        )}
      />
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || submitting}
        aria-label="Kill — trigger emergency stop"
        className={cn(
          // Base: big, fully rounded, blood-red with a radial highlight so it
          // reads as a physical mushroom-style emergency button. Fixed 180×180
          // circle (Andler spec: round, same size, 3D preserved — only the
          // container dimensions changed + font +10%).
          "relative inline-flex h-full w-full items-center justify-center gap-2.5",
          "rounded-full px-8 py-5 text-xl font-black uppercase tracking-widest",
          "text-white select-none transition-all duration-150",
          // The button's own shadows are only the INNER bevel (highlight on
          // top, shading at the bottom) — the outer drop shadow lives on the
          // fixed pedestal above, so it never moves with the button.
          "bg-gradient-to-b from-red-500 via-red-600 to-red-700",
          "shadow-[inset_0_2px_0_0_rgba(255,255,255,0.35),inset_0_-6px_12px_0_rgba(0,0,0,0.35)]",
          "ring-4 ring-red-900/40 ring-offset-2 ring-offset-background",
          "hover:brightness-110",
          // Press-down: the button sinks 6px into the fixed pedestal. The
          // pedestal (and its shadow) stays put, so the base appears fixed
          // while the button compresses into it.
          "active:translate-y-[6px]",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-500",
          "disabled:pointer-events-none disabled:opacity-60 disabled:translate-y-0",
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
    </div>
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
      // WebAuthn (yubi key) assertion — the preferred kill authorization
      // path (ADR-136). The backend accepts `Authorization: Assertion
      // <token>` bound to the kill action. If no key is registered, the
      // user cancels, or WebAuthn is unavailable, we fall back to the
      // dashboard session cookie (phrase confirmation already done).
      let assertionHeader: HeadersInit | undefined;
      try {
        const begin = await apiPost<Fido2AssertBeginResponse>(
          "/api/auth/webauthn/assert/begin",
          { action: "kill:fleet" },
        );
        const response = await startAuthentication({
          optionsJSON: begin.options,
        });
        const finish = await apiPost<Fido2AssertFinishResponse>(
          "/api/auth/webauthn/assert/finish",
          { challengeId: begin.challengeId, response },
        );
        if (finish.verified && finish.assertionToken) {
          assertionHeader = {
            Authorization: `Assertion ${finish.assertionToken}`,
          };
        }
      } catch (webauthnErr) {
        // No registered key / user cancelled / WebAuthn unavailable —
        // fall back to the dashboard session.
        console.warn(
          "[kill] WebAuthn assertion skipped, using session auth:",
          webauthnErr,
        );
      }

      const result = await apiPost<{
        current: KillSwitchState;
        previous: KillSwitchState;
        timestamp: number;
      }>(
        "/api/kill-switch/chaos",
        {
          state: nextState,
          reason: `Manual override via dashboard: ${nextState}`,
        },
        assertionHeader,
      );

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
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
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
              className="h-[180px] w-[180px]"
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


