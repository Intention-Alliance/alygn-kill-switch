"use client";

import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { LoaderHealthState } from "@/types/secrets";

interface LoaderHealthBadgeProps {
  state: LoaderHealthState;
  className?: string;
}

export function LoaderHealthBadge({ state, className }: LoaderHealthBadgeProps) {
  const isChecking = state === "checking";

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-mono border",
        state === "ok" && "bg-success/10 text-success border-success/20",
        isChecking && "bg-warning/10 text-warning border-warning/20",
        state === "error" && "bg-destructive/10 text-destructive border-destructive/20",
        className,
      )}
      aria-live="polite"
      role="status"
    >
      <span
        className={cn(
          "mr-1 inline-block h-2 w-2 rounded-full",
          state === "ok" && "bg-success",
          isChecking && "bg-warning motion-safe:animate-pulse",
          state === "error" && "bg-destructive",
        )}
        aria-hidden="true"
      />
      {isChecking ? "Checking…" : state === "ok" ? "OK" : "Down"}
    </Badge>
  );
}
