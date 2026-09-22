"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, RefreshCw, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionErrorBoundary } from "@/components/error-boundary";
import { MachineFlagRow } from "@/components/machines/machine-flag-row";
import { useMachineFlags } from "@/hooks/use-machine-flags";
import { formatFlagValueForInput, parseFlagInput } from "@/lib/machine-flags";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface MachineFlagsPanelProps {
  machineId: string;
  machineName: string;
  className?: string;
}

/**
 * Per-machine flag overrides — the primary surface (S4).
 *
 * Inline card on the machine detail page. The list-page dialog remains a
 * secondary entry point; both share MachineFlagRow and useMachineFlags.
 */
export function MachineFlagsPanel({
  machineId,
  machineName,
  className,
}: MachineFlagsPanelProps) {
  const { flags, overrides, isLoading, error, pendingKeys, refetch, setOverride, clearOverride } =
    useMachineFlags(machineId);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  // Seed drafts from the resolved values whenever the data changes.
  useEffect(() => {
    const initial: Record<string, string> = {};
    for (const f of flags) initial[f.key] = formatFlagValueForInput(f.value);
    setDrafts(initial);
    setDirtyKeys(new Set());
  }, [flags]);

  const overrideByKey = useMemo(
    () => new Map(overrides.map((o) => [o.flagKey, o])),
    [overrides],
  );

  const overriddenCount = flags.filter((f) => f.overridden).length;

  const handleChange = useCallback((key: string, next: string) => {
    setDrafts((prev) => ({ ...prev, [key]: next }));
    setDirtyKeys((prev) => new Set(prev).add(key));
  }, []);

  const handleSave = useCallback(
    async (key: string) => {
      const flag = flags.find((f) => f.key === key);
      if (!flag) return;
      const parsed = parseFlagInput(drafts[key] ?? "", flag.type, flag.key);
      if ("error" in parsed) {
        toast.error(parsed.error);
        return;
      }
      try {
        await setOverride(key, parsed.value);
        toast.success(`Saved override for ${key}`);
        setDirtyKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save override");
      }
    },
    [flags, drafts, setOverride],
  );

  const handleRevert = useCallback(
    async (key: string) => {
      try {
        await clearOverride(key);
        toast.success(`Reverted ${key} to global`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to revert override");
      }
    },
    [clearOverride],
  );

  return (
    <SectionErrorBoundary title="Machine Flags">
      <Card className={cn(className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-lg">
            <span className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" aria-hidden="true" />
              Feature Flags
            </span>
            <span className="flex items-center gap-2">
              {overriddenCount > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {overriddenCount} overridden
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => refetch()}
                disabled={isLoading}
                aria-label="Refresh machine flags"
              >
                <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
                <span className="ml-1">Refresh</span>
              </Button>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && flags.length === 0 ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{error}</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : flags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No flags available for this machine yet.
            </p>
          ) : (
            <div className="space-y-3">
              {flags.map((flag) => (
                <MachineFlagRow
                  key={flag.key}
                  flag={flag}
                  draftValue={drafts[flag.key] ?? ""}
                  isPending={pendingKeys.has(flag.key)}
                  isDirty={dirtyKeys.has(flag.key)}
                  overrideUpdatedAt={overrideByKey.get(flag.key)?.updatedAt ?? null}
                  onChange={(v) => handleChange(flag.key, v)}
                  onSave={() => handleSave(flag.key)}
                  onRevert={() => handleRevert(flag.key)}
                />
              ))}

              <Separator />

              <p className="text-xs text-muted-foreground">
                Overrides for <span className="font-mono">{machineName}</span>. Resolution
                order: <strong>machine override → global → default</strong>. All changes are
                recorded in the audit log with the machine ID and your user ID.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </SectionErrorBoundary>
  );
}
