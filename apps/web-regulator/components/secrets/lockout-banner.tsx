"use client";

import { AlertTriangle, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LockoutBannerProps {
  name: string;
  count: number;
  windowSec: number;
  autoUnlockAt: string;
  last401Source: string;
  dismissed: boolean;
  onDismiss: () => void;
  onViewHistory?: () => void;
  className?: string;
}

export function LockoutBanner({
  name,
  count,
  windowSec,
  autoUnlockAt,
  last401Source,
  dismissed,
  onDismiss,
  onViewHistory,
  className,
}: LockoutBannerProps) {
  if (dismissed) return null;

  const remainingMs = new Date(autoUnlockAt).getTime() - Date.now();
  const remainingText = remainingMs > 0 ? formatDuration(remainingMs) : "soon";

  return (
    <Alert
      variant="destructive"
      className={cn(
        "border-destructive/20 bg-destructive/5 px-3 py-2",
        className,
      )}
      role="alert"
      aria-live="assertive"
    >
      <AlertTriangle
        className="h-4 w-4 text-destructive"
        aria-hidden="true"
      />
      <div className="flex-1">
        <AlertTitle className="text-sm font-semibold">
          Key blocked. {count} consecutive 401s over the last {windowSec}s.
        </AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Auto-unlocks in {remainingText}. Last 401 source: {last401Source}.
        </AlertDescription>
      </div>
      <div className="flex items-center gap-2">
        {onViewHistory && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={onViewHistory}
          >
            View 401 history
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-6 w-6"
          onClick={onDismiss}
          aria-label="Dismiss lockout banner"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </Alert>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
