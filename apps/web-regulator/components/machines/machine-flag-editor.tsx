"use client";

/**
 * MachineFlagEditor — per-machine flag override dialog (v1.2)
 *
 * Secondary entry point from the machines list page. The primary surface is
 * MachineFlagsPanel on the machine detail page; both share MachineFlagRow and
 * useMachineFlags (S4).
 *
 * Contract (docs/api-contracts/per-machine-flags-v1.md):
 *   GET    /api/machines/:id/flags        (merged view + override markers)
 *   PUT    /api/machines/:id/flags/:key   (set/update override)
 *   DELETE /api/machines/:id/flags/:key   (clear override, 204)
 *
 * Resolution order (ADR-133): machine override > global > default.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Flag, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { MachineFlagRow } from "@/components/machines/machine-flag-row";
import { useMachineFlags } from "@/hooks/use-machine-flags";
import { formatFlagValueForInput, parseFlagInput } from "@/lib/machine-flags";
import { toast } from "sonner";

interface MachineFlagEditorProps {
  machineId: string;
  machineName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MachineFlagEditor({
  machineId,
  machineName,
  open,
  onOpenChange,
}: MachineFlagEditorProps) {
  const { flags, overrides, isLoading, error, pendingKeys, refetch, setOverride, clearOverride } =
    useMachineFlags(open ? machineId : "");

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const initial: Record<string, string> = {};
    for (const f of flags) initial[f.key] = formatFlagValueForInput(f.value);
    setDrafts(initial);
    setDirtyKeys(new Set());
  }, [open, flags]);

  const overrideByKey = useMemo(
    () => new Map(overrides.map((o) => [o.flagKey, o])),
    [overrides],
  );

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle>Per-Machine Flag Overrides</DialogTitle>
          </div>
          <DialogDescription>
            Override global flag values for{" "}
            <span className="font-mono text-foreground">{machineName}</span>.
            Resolution order: <strong>machine override → global → default</strong>.
          </DialogDescription>
        </DialogHeader>

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

            {flags.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No flags available for this machine yet.
              </p>
            )}

            <Separator />

            <p className="text-xs text-muted-foreground">
              Reverting an override falls back to the global flag value (or the
              system default if no global flag is set). All changes are recorded
              in the audit log with the machine ID and your user ID.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
