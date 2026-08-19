"use client";

/**
 * FIDO2 Revoke Dialog — confirm + revoke a security key (ADR-143).
 * Uses AlertDialog for the destructive confirmation. On confirm, calls
 * DELETE /api/auth/webauthn/credentials/:id and notifies the parent to
 * refresh the list.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { apiDelete } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import type { Fido2Credential, Fido2RevokeResponse } from "@/types/fido2";

interface Fido2RevokeDialogProps {
  credential: Fido2Credential | null;
  onOpenChange: (open: boolean) => void;
  onRevoked: () => void;
}

export function Fido2RevokeDialog({
  credential,
  onOpenChange,
  onRevoked,
}: Fido2RevokeDialogProps) {
  const [busy, setBusy] = useState(false);

  async function handleRevoke() {
    if (!credential) return;
    setBusy(true);
    try {
      await apiDelete<Fido2RevokeResponse>(
        `/api/auth/webauthn/credentials/${credential.id}`,
      );
      toast.success("Key removed", {
        description: `"${credential.name ?? "Key"}" was revoked.`,
      });
      onRevoked();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to revoke key";
      toast.error("Failed to remove key", { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={Boolean(credential)}
      onOpenChange={(open) => !busy && onOpenChange(open)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this security key?</AlertDialogTitle>
          <AlertDialogDescription>
            {credential ? (
              <>
                <span className="font-medium">{credential.name ?? "Unnamed key"}</span>{" "}
                will be revoked. You will no longer be able to sign in with it.
                This cannot be undone.
              </>
            ) : (
              "This key will be revoked. You will no longer be able to sign in with it."
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleRevoke();
            }}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                Removing…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
                Remove key
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
