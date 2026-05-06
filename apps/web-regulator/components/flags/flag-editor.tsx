"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { apiPost, apiPut } from "@/lib/api-client";
import { toast } from "sonner";
import type { Flag } from "@/types/shared";

interface FlagEditorProps {
  flag?: Flag;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (flag: Flag) => void;
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
  const [value, setValue] = useState(Boolean(flag?.value) ?? false);
  const [enabled, setEnabled] = useState(flag?.enabled ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="flag-value" className="font-medium">
                Value
              </Label>
              <p className="text-xs text-muted-foreground">
                Boolean flag state
              </p>
            </div>
            <Switch
              id="flag-value"
              checked={value}
              onCheckedChange={setValue}
              disabled={isSubmitting}
            />
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
