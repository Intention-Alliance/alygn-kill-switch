"use client";

import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SecretInfo } from "@/types/secrets";

interface RotateConfirmDialogProps {
  secret: SecretInfo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
}

export function RotateConfirmDialog({
  secret,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: RotateConfirmDialogProps) {
  if (!secret) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md p-6"
        role="alertdialog"
        aria-labelledby="rotate-title"
        aria-describedby="rotate-body"
        showCloseButton={false}
      >
        <DialogHeader className="gap-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className="h-5 w-5 text-warning"
              aria-hidden="true"
            />
            <DialogTitle id="rotate-title" className="text-lg font-semibold">
              Rotate{" "}
              <span className="font-mono text-xs">{secret.name}</span>?
            </DialogTitle>
          </div>
          <DialogDescription id="rotate-body" className="text-sm text-muted-foreground">
            A new value will be generated server-side and written to dependent
            config files. Apps reload via fs.watch + SIGHUP. Poll catches any
            drift within 24h.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <section>
            <h4 className="text-xs font-semibold">
              Dependent config files ({secret.dependentConfigs.length})
            </h4>
            <ul className="mt-1 list-inside list-disc text-xs font-mono text-muted-foreground">
              {secret.dependentConfigs.map((cfg) => (
                <li key={cfg.name}>{cfg.name}</li>
              ))}
            </ul>
          </section>

          <section>
            <h4 className="text-xs font-semibold">
              Apps to reload ({secret.reloadTargets.length})
            </h4>
            <ul className="mt-1 list-inside list-disc text-xs font-mono text-muted-foreground">
              {uniqueApps(secret.reloadTargets).map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </section>

          <p className="text-xs italic text-muted-foreground">
            The rotated value never leaves the server.
          </p>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            className="focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
          >
            {isPending ? "Rotating…" : "Rotate now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function uniqueApps(targets: { name: string }[]): string[] {
  return Array.from(new Set(targets.map((t) => t.name)));
}
