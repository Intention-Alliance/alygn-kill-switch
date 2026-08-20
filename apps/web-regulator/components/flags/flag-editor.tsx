"use client";

import { useState } from "react";
import { Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { apiPost, apiPut } from "@/lib/api-client";
import { toast } from "sonner";
import type { Flag } from "@/types/shared";

// ─── ADR-133 Predefined Flag Keys ──────────────────────────────────

const PREDEFINED_FLAG_KEYS = [
  {
    key: "llm_interception_enabled",
    type: "boolean",
    description: "Master toggle for LLM request interception",
  },
  {
    key: "auto_stop_threshold",
    type: "number",
    description: "Score threshold for automatic blocking (0.0–1.0)",
  },
  {
    key: "damage_logging_level",
    type: "string",
    description: "Verbosity: minimal / standard / verbose",
  },
  {
    key: "alert_on_critical_score",
    type: "boolean",
    description: "Desktop notification on critical events",
  },
  {
    key: "request_sampling_rate",
    type: "number",
    description: "Percentage of requests to sample (0.0–1.0)",
  },
] as const;

interface FlagEditorProps {
  flag?: Flag;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (flag: Flag) => void;
}

type FlagValue = boolean | string | number;

// Resolve the flag's value type. For predefined flags we know the type
// explicitly; for custom flags we infer it from the current value.
function resolveFlagType(key: string, value: FlagValue | undefined): "boolean" | "number" | "string" {
  const predefined = PREDEFINED_FLAG_KEYS.find((p) => p.key === key);
  if (predefined) return predefined.type;
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

export function FlagEditor({
  flag,
  open,
  onOpenChange,
  onSaved,
}: FlagEditorProps) {
  const isEditing = !!flag;
  const [key, setKey] = useState(flag?.key ?? "");
  const [description, setDescription] = useState(flag?.description ?? "");
  const [value, setValue] = useState<FlagValue>(flag?.value ?? false);
  const [enabled, setEnabled] = useState(flag?.enabled ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const flagType = resolveFlagType(key, value);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;

    setIsSubmitting(true);
    try {
      let result: { flag: Flag };

      if (isEditing && flag) {
        result = await apiPut<{ flag: Flag }>(`/api/flags/${flag.id}`, {
          key: key.trim(),
          description: description.trim() || undefined,
          value,
          enabled,
        });
        toast.success(`Flag "${key}" updated`);
      } else {
        result = await apiPost<{ flag: Flag }>("/api/flags", {
          key: key.trim(),
          description: description.trim() || undefined,
          value,
          enabled,
        });
        toast.success(`Flag "${key}" created`);
      }

      onSaved(result.flag);
      onOpenChange(false);

      // Reset form
      setKey("");
      setDescription("");
      setValue(false);
      setEnabled(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Operation failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Flag" : "Create Flag"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the flag configuration."
              : "Create a new feature flag with default settings."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Predefined Flag Selector — only shown when creating */}
          {!isEditing && (
            <div className="space-y-2">
              <Label>Quick-Select Predefined Flag</Label>
              <Select
                onValueChange={(selected) => {
                  const predefined = PREDEFINED_FLAG_KEYS.find((p) => p.key === selected);
                  if (predefined) {
                    setKey(predefined.key);
                    setDescription(predefined.description);
                    // Set sensible defaults per type
                    if (predefined.type === "boolean") {
                      setValue(true);
                    } else if (predefined.type === "number") {
                      setValue(0.9);
                    } else {
                      setValue("standard");
                    }
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a predefined flag or type a custom key below…" />
                </SelectTrigger>
                <SelectContent>
                  {PREDEFINED_FLAG_KEYS.map((pf) => (
                    <SelectItem key={pf.key} value={pf.key}>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono">{pf.key}</code>
                        <span className="text-xs text-muted-foreground">{pf.description.slice(0, 50)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="flag-key">Key</Label>
            <Input
              id="flag-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g., enable_new_dashboard"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="flag-description">Description</Label>
            <Input
              id="flag-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this flag controls"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="flag-value" className="font-medium">
              Value
            </Label>
            <p className="text-xs text-muted-foreground">
              {flagType === "boolean"
                ? "Boolean flag state"
                : flagType === "number"
                  ? "Numeric flag value (0.0–1.0)"
                  : "String flag value"}
            </p>
            {flagType === "boolean" ? (
              <div className="flex items-center justify-between rounded-md border p-3">
                <Switch
                  id="flag-value"
                  checked={Boolean(value)}
                  onCheckedChange={(c) => setValue(c)}
                  disabled={isSubmitting}
                />
              </div>
            ) : flagType === "number" ? (
              <Input
                id="flag-value"
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={String(value)}
                onChange={(e) => setValue(Number(e.target.value))}
                disabled={isSubmitting}
                className="font-mono"
              />
            ) : (
              <Input
                id="flag-value"
                type="text"
                value={String(value)}
                onChange={(e) => setValue(e.target.value)}
                disabled={isSubmitting}
                className="font-mono"
              />
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="flag-enabled" className="font-medium">
                Enabled
              </Label>
              <p className="text-xs text-muted-foreground">
                Whether this flag is actively evaluated
              </p>
            </div>
            <Switch
              id="flag-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
              disabled={isSubmitting}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !key.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : isEditing ? (
                "Save Changes"
              ) : (
                "Create Flag"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
