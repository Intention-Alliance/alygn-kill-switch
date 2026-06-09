"use client";

/**
 * MachineFlagEditor — Per-machine flag override editor (v1.1)
 *
 * Mirrors the 5 predefined ADR-133 flags and lets an admin set/clear
 * machine-scoped overrides via the contract from
 * `docs/api-contracts/per-machine-flags-v1.md`:
 *
 *   GET    /api/machines/:id/flags            (merged view + override markers)
 *   PUT    /api/machines/:id/flags/:key       (set/update override)
 *   DELETE /api/machines/:id/flags/:key       (clear override, 204)
 *
 * Resolution order (per ADR-133):
 *   machine override > global flag > default
 */

import { useCallback, useEffect, useState } from "react";
import { Flag, Loader2, RotateCcw, Save, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiGet, apiPut, apiDelete } from "@/lib/api-client";
import { toast } from "sonner";

// ─── ADR-133 Predefined Flags (mirror of /flags page) ──────────────

type FlagType = "boolean" | "number" | "string";

interface PredefinedFlag {
  key: string;
  type: FlagType;
  description: string;
}

const PREDEFINED_FLAGS: PredefinedFlag[] = [
  {
    key: "llm_interception_enabled",
    type: "boolean",
    description:
      "Master toggle for LLM request interception. When false, all requests pass through unscored. Toggle per-machine for granular control.",
  },
  {
    key: "auto_stop_threshold",
    type: "number",
    description:
      "Score threshold for automatic blocking (0.0–1.0). Lower values = stricter blocking. Set to 1.0 to disable auto-blocking while still logging scores.",
  },
  {
    key: "damage_logging_level",
    type: "string",
    description:
      "Verbosity: minimal (blocked only), standard (blocked + near-threshold), verbose (all scored). Higher levels increase storage usage.",
  },
  {
    key: "alert_on_critical_score",
    type: "boolean",
    description:
      "Desktop notification on critical events when request score exceeds 0.9. Early warning before auto-stop triggers.",
  },
  {
    key: "request_sampling_rate",
    type: "number",
    description:
      "Percentage of requests to sample (0.0–1.0). At 1.0 every request is scored. Lower values reduce CPU load but create blind spots.",
  },
];

const DAMAGE_LEVEL_OPTIONS = ["minimal", "standard", "verbose"] as const;

// ─── Contract response shapes ──────────────────────────────────────

interface MachineFlagEntry {
  key: string;
  value: boolean | number | string;
  type: FlagType;
  description: string;
  overridden: boolean;
}

interface MachineFlagsResponse {
  machineId: string;
  flags: MachineFlagEntry[];
  overrides: Array<{
    flagKey: string;
    value: string;
    updatedAt: string;
  }>;
}

interface MachineFlagEditorProps {
  machineId: string;
  machineName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Component ──────────────────────────────────────────────────────

export function MachineFlagEditor({
  machineId,
  machineName,
  open,
  onOpenChange,
}: MachineFlagEditorProps) {
  const [flags, setFlags] = useState<MachineFlagEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  // Local edit buffer keyed by flag key. We keep the *resolved* value
  // the user typed, plus a dirty marker, so we can disable Save unless
  // the value actually differs from what the server returned.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());

  // ─── Fetch merged view on open ──────────────────────────────────
  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiGet<MachineFlagsResponse>(
        `/api/machines/${machineId}/flags`,
      );
      setFlags(data.flags ?? []);

      // Seed drafts with current effective values
      const initial: Record<string, string> = {};
      for (const f of data.flags ?? []) {
        initial[f.key] = formatForInput(f.value);
      }
      setDrafts(initial);
      setDirtyKeys(new Set());
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load machine flags";
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [machineId]);

  useEffect(() => {
    if (open) {
      refetch();
    }
  }, [open, refetch]);

  // ─── Mutation handlers ──────────────────────────────────────────

  const setPending = useCallback((key: string, on: boolean) => {
    setPendingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const setDirty = useCallback((key: string, on: boolean) => {
    setDirtyKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  async function handleSave(key: string) {
    const flag = flags.find((f) => f.key === key);
    if (!flag) return;

    const raw = drafts[key];
    const parsed = parseFromInput(raw, flag.type);
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }

    setPending(key, true);
    try {
      await apiPut(`/api/machines/${machineId}/flags/${key}`, {
        value: parsed.value,
      });
      toast.success(`Saved override for ${key}`);
      setDirty(key, false);
      // Refresh so the "overriding global" badge reflects the new state
      await refetch();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save override";
      toast.error(message);
    } finally {
      setPending(key, false);
    }
  }

  async function handleRevert(key: string) {
    setPending(key, true);
    try {
      await apiDelete(`/api/machines/${machineId}/flags/${key}`);
      toast.success(`Reverted ${key} to global`);
      await refetch();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to revert override";
      toast.error(message);
    } finally {
      setPending(key, false);
    }
  }

  function handleDraftChange(key: string, next: string) {
    setDrafts((prev) => ({ ...prev, [key]: next }));
    setDirty(key, true);
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-primary" />
            <DialogTitle>Per-Machine Flag Overrides</DialogTitle>
          </div>
          <DialogDescription>
            Override global flag values for{" "}
            <span className="font-mono text-foreground">{machineName}</span>.
            Resolution order: <strong>machine override → global → default</strong>.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <div className="space-y-3">
            {PREDEFINED_FLAGS.map((predef) => {
              const flag = flags.find((f) => f.key === predef.key);
              if (!flag) {
                // Flag not yet returned by the backend (contract § 3.1 says
                // exactly 5 rows; this branch should not fire in practice).
                return null;
              }
              const isPending = pendingKeys.has(predef.key);
              const isDirty = dirtyKeys.has(predef.key);
              const currentInput = drafts[predef.key] ?? "";
              return (
                <FlagRow
                  key={predef.key}
                  flag={flag}
                  draftValue={currentInput}
                  isPending={isPending}
                  isDirty={isDirty}
                  onChange={(v) => handleDraftChange(predef.key, v)}
                  onSave={() => handleSave(predef.key)}
                  onRevert={() => handleRevert(predef.key)}
                />
              );
            })}

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

// ─── Flag Row ──────────────────────────────────────────────────────

interface FlagRowProps {
  flag: MachineFlagEntry;
  draftValue: string;
  isPending: boolean;
  isDirty: boolean;
  onChange: (next: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

function FlagRow({
  flag,
  draftValue,
  isPending,
  isDirty,
  onChange,
  onSave,
  onRevert,
}: FlagRowProps) {
  return (
    <div className="rounded-lg border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-semibold">
              {flag.key}
            </code>
            <Badge variant="secondary" className="text-[10px] h-4 px-1">
              {flag.type}
            </Badge>
            {flag.overridden && (
              <Badge
                variant="outline"
                className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
                title="This machine has a local override for this flag"
                aria-label="Local override active, differs from global"
              >
                overriding global
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {flag.description}
          </p>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1 min-w-0">
          <label
            htmlFor={`flag-${flag.key}`}
            className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider"
          >
            Current value
          </label>
          <div className="mt-1">
            <FlagValueInput
              flag={flag}
              value={draftValue}
              onChange={onChange}
              disabled={isPending}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 shrink-0">
          <Button
            size="sm"
            onClick={onSave}
            disabled={!isDirty || isPending}
            className="h-7 text-xs"
          >
            {isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Save className="h-3 w-3" />
            )}
            <span className="ml-1">Save</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onRevert}
            disabled={!flag.overridden || isPending}
            className="h-7 text-xs"
            title={
              flag.overridden
                ? "Clear the override; this machine will use the global value"
                : "No override to revert"
            }
          >
            <RotateCcw className="h-3 w-3" />
            <span className="ml-1">Revert</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Flag Value Input (switched per type) ──────────────────────────

function FlagValueInput({
  flag,
  value,
  onChange,
  disabled,
}: {
  flag: MachineFlagEntry;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  if (flag.type === "boolean") {
    const checked = value === "true" || value === "1";
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={checked}
          onCheckedChange={(c) => onChange(c ? "true" : "false")}
          disabled={disabled}
          size="sm"
        />
        <span
          className={cn(
            "text-xs font-mono",
            checked ? "text-primary" : "text-muted-foreground",
          )}
        >
          {checked ? "true" : "false"}
        </span>
      </div>
    );
  }

  if (flag.type === "string") {
    return (
      <Select
        value={value || DAMAGE_LEVEL_OPTIONS[1]}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger id={`flag-${flag.key}`} className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DAMAGE_LEVEL_OPTIONS.map((opt) => (
            <SelectItem key={opt} value={opt} className="text-xs">
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // number
  return (
    <Input
      id={`flag-${flag.key}`}
      type="number"
      min={0}
      max={1}
      step={0.05}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="h-8 text-xs font-mono"
    />
  );
}

// ─── Input / Output marshalling ────────────────────────────────────

function formatForInput(v: boolean | number | string): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

type ParseResult = { value: unknown; error?: undefined } | { error: string };

function parseFromInput(raw: string, type: FlagType): ParseResult {
  if (type === "boolean") {
    if (raw === "true" || raw === "false") return { value: raw === "true" };
    return { error: "Value must be true or false" };
  }
  if (type === "string") {
    if (DAMAGE_LEVEL_OPTIONS.includes(raw as (typeof DAMAGE_LEVEL_OPTIONS)[number])) {
      return { value: raw };
    }
    return {
      error: `Value must be one of: ${DAMAGE_LEVEL_OPTIONS.join(", ")}`,
    };
  }
  // number
  const n = Number(raw);
  if (!Number.isFinite(n)) return { error: "Value must be a number" };
  if (n < 0 || n > 1)
    return { error: "Value must be in the range [0.0, 1.0]" };
  return { value: n };
}
