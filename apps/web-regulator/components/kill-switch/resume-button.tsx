"use client";

import { useCallback, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";

export interface ResumeButtonProps {
  onResumed: () => void;
  className?: string;
}

/**
 * Resume inference traffic — unified (previously duplicated in the
 * kill-switch page and dashboard-tabs). Uses the Play icon variant.
 */
export function ResumeButton({ onResumed, className }: ResumeButtonProps) {
  const [isResuming, setIsResuming] = useState(false);

  const handleResume = useCallback(async () => {
    setIsResuming(true);
    try {
      await apiPost("/api/kill-switch/chaos", {
        state: "RUNNING",
        reason: "Manual resume from dashboard",
      });
      toast.success("Kill Switch resumed — inference traffic flowing");
      onResumed();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to resume kill switch",
      );
    } finally {
      setIsResuming(false);
    }
  }, [onResumed]);

  return (
    <Button
      onClick={handleResume}
      disabled={isResuming}
      variant="default"
      className={className ?? "w-full sm:w-auto"}
      aria-label="Resume inference traffic"
    >
      {isResuming ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Resuming…
        </>
      ) : (
        <>
          <Play className="mr-2 h-4 w-4" aria-hidden="true" />
          Resume Inference Traffic
        </>
      )}
    </Button>
  );
}
