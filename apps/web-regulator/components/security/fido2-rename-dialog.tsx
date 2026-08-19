"use client";

/**
 * FIDO2 Rename Dialog — rename a security key's human label (ADR-143).
 * Calls PATCH /api/auth/webauthn/credentials/:id { name } and notifies
 * the parent to refresh the list.
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiPatch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import type { Fido2Credential, Fido2RenameResponse } from "@/types/fido2";

interface Fido2RenameDialogProps {
  credential: Fido2Credential | null;
  onOpenChange: (open: boolean) => void;
  onRenamed: () => void;
}

export function Fido2RenameDialog({
  credential,
  onOpenChange,
  onRenamed,
}: Fido2RenameDialogProps) {
  const [name, setName] = useState(credential?.name ?? "");
  const [busy, setBusy] = useState(false);

  // Sync the input when a different credential is opened. Runs in an
  // effect (not the render phase) to avoid setState-during-render.
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => {
    if (credential && credential.id !== lastId) {
      setLastId(credential.id);
      setName(credential.name ?? "");
    }
  }, [credential, lastId]);

  async function handleSave() {
    if (!credential || !name.trim()) return;
    setBusy(true);
    try {
      await apiPatch<Fido2RenameResponse>(
        `/api/auth/webauthn/credentials/${credential.id}`,
        { name: name.trim() },
      );
      toast.success("Key renamed");
      onRenamed();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to rename key";
      toast.error("Failed to rename key", { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={Boolean(credential)}
      onOpenChange={(open) => !busy && onOpenChange(open)}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename security key</DialogTitle>
          <DialogDescription>
            Give this key a recognizable name.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="fido2-rename">Key name</Label>
          <Input
            id="fido2-rename"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. YubiKey 5C — Andler"
            maxLength={40}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy || !name.trim()}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              "Save"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
