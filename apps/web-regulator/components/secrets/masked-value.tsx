"use client";

import { cn } from "@/lib/utils";

interface MaskedValueProps {
  prefix: string;
  suffix: string;
  /** Total number of bullets to show between prefix and suffix. */
  bulletCount?: number;
  className?: string;
}

/**
 * Renders a server-safe masked value (e.g. "tsau_••••••••aaaa").
 * Never reveals the raw value.
 */
export function MaskedValue({
  prefix,
  suffix,
  bulletCount = 8,
  className,
}: MaskedValueProps) {
  return (
    <span
      className={cn("font-mono text-xs tracking-tight", className)}
      aria-label={`Masked value ending in ${suffix}`}
    >
      {prefix}
      {"•".repeat(bulletCount)}
      {suffix}
    </span>
  );
}
