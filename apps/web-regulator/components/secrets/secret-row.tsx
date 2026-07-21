"use client";

import { RefreshCw, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MaskedValue } from "./masked-value";
import { cn } from "@/lib/utils";
import type { SecretInfo } from "@/types/secrets";

interface SecretRowProps {
  secret: SecretInfo;
  isLocked: boolean;
  isRotating: boolean;
  onRotate: (secret: SecretInfo) => void;
  rotateButtonRef?: (name: string, el: HTMLButtonElement | null) => void;
}

export function SecretRow({
  secret,
  isLocked,
  isRotating,
  onRotate,
  rotateButtonRef,
}: SecretRowProps) {
  const ageText = formatAge(secret.lastRotatedAt);
  const filesText = `${secret.dependentConfigs.length} file${secret.dependentConfigs.length === 1 ? "" : "s"}`;
  const filesTooltip = secret.dependentConfigs.map((c) => c.name).join(", ");

  return (
    <tr
      className={cn(
        "h-8 border-b transition-colors hover:bg-muted/50",
        isLocked && "bg-destructive/5 border-l-2 border-l-destructive",
      )}
      aria-label={`Row: ${secret.name}, ${isLocked ? "locked" : "armed"}, rotated ${ageText}`}
      tabIndex={0}
    >
      <td className="w-[280px] px-2 align-middle">
        <div className="flex items-center gap-1.5">
          {isLocked && (
            <Lock className="h-3 w-3 text-destructive" aria-hidden="true" />
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="max-w-[240px] truncate font-mono text-xs">
                {secret.name}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{secret.name}</TooltipContent>
          </Tooltip>
        </div>
      </td>

      <td className="w-[200px] px-2 align-middle">
        <MaskedValue
          prefix="tsau_"
          suffix={secret.previewSuffix}
          className={isLocked ? "opacity-70" : undefined}
        />
      </td>

      <td className="w-[120px] px-2 align-middle">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground">
              {ageText}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {new Date(secret.lastRotatedAt).toISOString()} UTC
          </TooltipContent>
        </Tooltip>
      </td>

      <td className="w-[140px] px-2 align-middle">
        {isLocked ? (
          <Badge
            variant="destructive"
            className="text-[10px] font-mono"
            aria-label="Locked"
          >
            <Lock className="mr-1 h-2.5 w-2.5" aria-hidden="true" />
            LOCKED
          </Badge>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs text-muted-foreground truncate max-w-[120px] block">
                {filesText}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{filesTooltip}</TooltipContent>
          </Tooltip>
        )}
      </td>

      <td className="w-[100px] px-2 align-middle">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isLocked || isRotating}
              onClick={() => onRotate(secret)}
              ref={(el) => rotateButtonRef?.(secret.name, el)}
              aria-label={isLocked ? "Rotate disabled, secret is locked" : `Rotate ${secret.name}`}
              className={cn(
                "disabled:opacity-70",
                "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
              )}
            >
              {isRotating ? (
                <RefreshCw className="mr-1 h-3 w-3 motion-safe:animate-spin" aria-hidden="true" />
              ) : isLocked ? (
                <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
              )}
              {isRotating ? "Rotating…" : "Rotate"}
            </Button>
          </TooltipTrigger>
          {isLocked && (
            <TooltipContent side="top" className="max-w-xs">
              Locked after 50 consecutive 401s. Auto-unlocks in 48h. No manual unlock.
            </TooltipContent>
          )}
        </Tooltip>
      </td>
    </tr>
  );
}

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
