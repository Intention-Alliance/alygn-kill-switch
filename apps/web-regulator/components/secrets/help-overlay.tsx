"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd } from "./kbd";

interface HelpOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  { keys: ["Tab / Shift+Tab"], action: "Move focus through interactive elements" },
  { keys: ["j", "k"], action: "Next / previous row in secrets table" },
  { keys: ["r"], action: "Rotate the focused row" },
  { keys: ["Esc"], action: "Close dialog or clear filter" },
  { keys: ["Cmd+K"], action: "Open command palette" },
  { keys: ["?"], action: "Open this help overlay" },
  { keys: ["g", "s"], action: "Go to Secrets" },
  { keys: ["g", "k"], action: "Go to Kill Switch" },
];

export function HelpOverlay({ open, onOpenChange }: HelpOverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-6" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Operator shortcuts for the Secrets surface.
          </DialogDescription>
        </DialogHeader>
        <dl className="mt-4 space-y-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={shortcut.action}
              className="flex items-center justify-between text-xs"
            >
              <dt className="text-muted-foreground">{shortcut.action}</dt>
              <dd className="flex items-center gap-1">
                {shortcut.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
