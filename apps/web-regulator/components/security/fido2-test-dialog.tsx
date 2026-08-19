"use client";

/**
 * FIDO2 Test Dialog — runs a WebAuthn assertion ceremony to prove a key
 * works end-to-end (ADR-143). Flow:
 *   POST /assert/begin { action: "test:signin" } → options + challengeId
 *   startAuthentication(options) → user touches the key
 *   POST /assert/finish { challengeId, response } → { verified, expiresAt }
 *
 * On success shows "✓ Verified" + the assertion token expiry.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2, XCircle, Fingerprint } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  Fido2AssertBeginResponse,
  Fido2AssertFinishResponse,
  Fido2Credential,
} from "@/types/fido2";

interface Fido2TestDialogProps {
  credential: Fido2Credential | null;
  onOpenChange: (open: boolean) => void;
}

type TestState = "idle" | "running" | "success" | "error";

export function Fido2TestDialog({
  credential,
  onOpenChange,
}: Fido2TestDialogProps) {
  const [state, setState] = useState<TestState>("idle");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setState("idle");
    setExpiresAt(null);
    setError(null);
  }

  function handleOpenChange(open: boolean) {
    onOpenChange(open);
    if (!open) reset();
  }

  async function runTest() {
    if (!credential) return;
    setState("running");
    setError(null);
    try {
      const begin = await apiPost<Fido2AssertBeginResponse>(
        "/api/auth/webauthn/assert/begin",
        { action: "test:signin" },
      );

      const response = await startAuthentication({
        optionsJSON: begin.options,
      });

      const result = await apiPost<Fido2AssertFinishResponse>(
        "/api/auth/webauthn/assert/finish",
        { challengeId: begin.challengeId, response },
      );

      if (!result.verified) {
        throw new Error("Assertion was not verified by the server");
      }

      setExpiresAt(result.expiresAt);
      setState("success");
      toast.success("Key verified", {
        description: `"${credential.name ?? "Key"}" works end-to-end.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Test failed";
      setError(message);
      setState("error");
      toast.error("Test failed", { description: message });
    }
  }

  return (
    <Dialog
      open={Boolean(credential)}
      onOpenChange={handleOpenChange}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Test Security Key</DialogTitle>
          <DialogDescription>
            {credential
              ? `Verify "${credential.name ?? "Unnamed key"}" works end-to-end.`
              : "Verify a security key works end-to-end."}
          </DialogDescription>
        </DialogHeader>

        {state === "idle" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Fingerprint className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Touch your security key when the browser prompts you.
            </p>
          </div>
        )}

        {state === "running" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              Waiting for your key… Touch it to confirm.
            </p>
          </div>
        )}

        {state === "success" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">✓ Verified</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Assertion token expires{" "}
                {expiresAt
                  ? new Date(expiresAt).toLocaleString()
                  : "—"}
              </p>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <XCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Verification failed</p>
              {error && (
                <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {state === "idle" && (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={runTest}>
                <Fingerprint className="h-4 w-4 mr-1" aria-hidden="true" />
                Start test
              </Button>
            </>
          )}
          {state === "running" && (
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
          )}
          {(state === "success" || state === "error") && (
            <>
              {state === "error" && (
                <Button variant="outline" onClick={runTest}>
                  Retry
                </Button>
              )}
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
