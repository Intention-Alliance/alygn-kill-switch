"use client";

import { Key } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  onGenerate?: () => void;
}

export function EmptyState({ onGenerate }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-md border bg-card py-24">
      <Key className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="text-base font-medium">No Tailscale secrets yet.</h2>
      <p className="max-w-md px-6 text-center text-sm text-muted-foreground">
        Generate OLLAMA_TAILSCALE_AUTH_TOKEN to start. Required for the
        openclaw-webhook → ollama surface.
      </p>
      {onGenerate && (
        <Button size="lg" onClick={onGenerate}>
          Generate first secret
        </Button>
      )}
    </div>
  );
}
