"use client";

/**
 * FIDO2 Register Dialog — drives the WebAuthn registration ceremony
 * (ADR-143). Flow:
 *   1. "Insert & touch" ready state (USB / NFC / BLE affordance)
 *   2. Name the key (human label)
 *   3. Browser WebAuthn ceremony (navigator.credentials.create via
 *      @simplewebauthn/browser startRegistration)
 *   4. Success → parent refreshes the list
 *
 * The ceremony is never stubbed: it calls the real backend ceremony
 * endpoints and the real browser WebAuthn API.
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  Usb,
  Nfc,
  Bluetooth,
  Loader2,
  Fingerprint,
  CheckCircle2,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  Fido2RegisterBeginResponse,
  Fido2RegisterFinishResponse,
} from "@/types/fido2";

interface Fido2RegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
}

type Step = "ready" | "name" | "ceremony" | "success";

const TRANSPORT_ICONS = [
  { icon: Usb, label: "USB" },
  { icon: Nfc, label: "NFC" },
  { icon: Bluetooth, label: "BLE" },
];

export function Fido2RegisterDialog({
  open,
  onOpenChange,
  onRegistered,
}: Fido2RegisterDialogProps) {
  const [step, setStep] = useState<Step>("ready");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("ready");
    setName("");
    setBusy(false);
    setError(null);
  }

  function handleOpenChange(next: boolean) {
    if (busy) return; // don't allow closing mid-ceremony
    onOpenChange(next);
    if (!next) reset();
  }

  async function runCeremony() {
    setBusy(true);
    setError(null);
    setStep("ceremony");
    try {
      // 1. Begin registration → get options + challengeId
      const begin = await apiPost<Fido2RegisterBeginResponse>(
        "/api/auth/webauthn/register/begin",
      );

      // 2. Browser WebAuthn ceremony — user touches the key
      const response = await startRegistration({
        optionsJSON: begin.options,
      });

      // 3. Finish registration with the attestation response + name
      await apiPost<Fido2RegisterFinishResponse>(
        "/api/auth/webauthn/register/finish",
        {
          challengeId: begin.challengeId,
          response,
          name: name.trim(),
        },
      );

      setStep("success");
      toast.success("Key registered", {
        description: `"${name.trim()}" is now active.`,
      });
      onRegistered();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Registration failed";
      setError(message);
      setStep("name");
      toast.error("Registration failed", { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register New Security Key</DialogTitle>
          <DialogDescription>
            Register a hardware security key for admin sign-in.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper dots */}
        <div className="flex items-center gap-1.5" aria-hidden="true">
          {(["ready", "name", "ceremony", "success"] as Step[]).map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                step === s || (["name", "ceremony", "success"].indexOf(step) > i)
                  ? "bg-primary"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>

        {step === "ready" && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-4 py-4">
              {TRANSPORT_ICONS.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1.5 text-muted-foreground"
                >
                  <Icon className="h-8 w-8" aria-hidden="true" />
                  <span className="text-xs">{label}</span>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Insert your YubiKey and touch the gold contact when prompted.
            </p>
          </div>
        )}

        {step === "name" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="fido2-key-name">Key name</Label>
              <Input
                id="fido2-key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. YubiKey 5C — Andler"
                maxLength={40}
                autoFocus
              />
            </div>
            {error && (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        {step === "ceremony" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Your browser is now talking to your key. Touch the key again to
              confirm.
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Key registered successfully</p>
              <p className="mt-1 text-sm text-muted-foreground">
                <Badge variant="secondary" className="font-normal">
                  {name.trim()}
                </Badge>{" "}
                is now active.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === "ready" && (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep("name")}>
                <Fingerprint className="h-4 w-4 mr-1" aria-hidden="true" />
                Next: Name the key
              </Button>
            </>
          )}
          {step === "name" && (
            <>
              <Button variant="ghost" onClick={() => setStep("ready")} disabled={busy}>
                Back
              </Button>
              <Button onClick={runCeremony} disabled={busy || !name.trim()}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                    Registering…
                  </>
                ) : (
                  "Register Key"
                )}
              </Button>
            </>
          )}
          {step === "ceremony" && (
            <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
          )}
          {step === "success" && (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
