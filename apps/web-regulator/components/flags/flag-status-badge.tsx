"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Flag } from "@/types/shared";

interface FlagStatusBadgeProps {
  flag: Pick<Flag, "enabled" | "key">;
  className?: string;
}

export function FlagStatusBadge({ flag, className }: FlagStatusBadgeProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Badge variant={flag.enabled ? "default" : "secondary"}>
        {flag.enabled ? "Active" : "Inactive"}
      </Badge>
    </div>
  );
}


