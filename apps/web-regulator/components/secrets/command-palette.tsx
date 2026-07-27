"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { RefreshCw, History, Key, Shield } from "lucide-react";
import type { SecretInfo } from "@/types/secrets";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secrets: SecretInfo[];
  onRotate: (secret: SecretInfo) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  secrets,
  onRotate,
}: CommandPaletteProps) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Command Palette">
      <CommandInput placeholder="Type a command or search secrets…" />
      <CommandList>
        <CommandEmpty>No commands found.</CommandEmpty>
        <CommandGroup heading="Rotate secret">
          {secrets.map((secret) => (
            <CommandItem
              key={secret.name}
              onSelect={() => {
                onRotate(secret);
                onOpenChange(false);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-mono text-xs">Rotate {secret.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => {
              window.location.href = "/admin/secrets";
            }}
          >
            <Key className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Go to Secrets</span>
            <CommandShortcut>g s</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              window.location.href = "/kill-switch";
            }}
          >
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Go to Kill Switch</span>
            <CommandShortcut>g k</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              document.getElementById("audit-filter")?.focus();
              onOpenChange(false);
            }}
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Focus audit log filter</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
