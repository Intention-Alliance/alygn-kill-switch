"use client";

import { Loader2, RotateCcw, Save } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  DAMAGE_LEVEL_OPTIONS,
  provenanceLabel,
  resolveProvenance,
  type MachineFlagEntry,
} from "@/lib/machine-flags";

export interface MachineFlagRowProps {
  flag: MachineFlagEntry & { globalValue?: boolean | number | string | null };
  draftValue: string;
  isPending: boolean;
  isDirty: boolean;
  overrideUpdatedAt?: string | null;
  onChange: (next: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

/**
 * One flag row — shared by the machine detail panel and the list-page dialog.
 *
 * Extracted from machine-flag-editor.tsx (FlagRow + FlagValueInput) and
 * extended with a provenance chip (S4).
 */
export function MachineFlagRow({
  flag,
  draftValue,
  isPending,
  isDirty,
  overrideUpdatedAt,
  onChange,
  onSave,
  onRevert,
}: MachineFlagRowProps) {
  const provenance = resolveProvenance(flag, flag.globalValue);
  const isUnset = provenance === "unset";
  const globalHint =
    flag.globalValue !== null && flag.globalValue !== undefined
      ? `global: ${String(flag.globalValue)}`
      : null;

  return (
    <div className="rounded-lg border bg-card p-3 space-y-2" role="group" aria-label={flag.key}>
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
            <Badge
              variant="outline"
              className="text-[10px] h-4 px-1 text-muted-foreground"
              title={provenanceLabel(provenance)}
            >
              {provenanceLabel(provenance)}
              {provenance === "global" && globalHint ? ` (${globalHint})` : ""}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {flag.description}
          </p>
          {flag.overridden && overrideUpdatedAt && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              override set {new Date(overrideUpdatedAt).toLocaleString()}
            </p>
          )}
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
            disabled={!isDirty || isPending || isUnset}
            className="h-7 text-xs"
            title={isUnset ? "Type a value before saving" : undefined}
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

/** Typed input, switched per flag type. */
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
    if (flag.key === "damage_logging_level") {
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
    return (
      <Input
        id={`flag-${flag.key}`}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-8 text-xs font-mono"
      />
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
