"use client";

import { useState, useEffect } from "react";
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
import { apiPost, apiPut } from "@/lib/api-client";
import { BRAND_NAME } from "@/lib/branding";
import { toast } from "sonner";
import type { Machine, MachineSpecs } from "@/types/shared";

interface MachineEditorProps {
  machine?: Machine;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (machine: Machine) => void;
}

interface MachineEditorForm {
  name: string;
  hostname: string;
  role: string;
  hasDpu: boolean;
  specs: MachineSpecs;
}

const DEFAULT_SPECS: MachineSpecs = {
  cpu: "",
  ram: "",
  gpu: "",
  dpu: null,
};

export function MachineEditor({
  machine,
  open,
  onOpenChange,
  onSaved,
}: MachineEditorProps) {
  const isEditing = !!machine;

  const [form, setForm] = useState<MachineEditorForm>({
    name: "",
    hostname: "",
    role: "",
    hasDpu: false,
    specs: { ...DEFAULT_SPECS },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset form when machine or open changes
  useEffect(() => {
    if (open) {
      setForm({
        name: machine?.name ?? "",
        hostname: machine?.hostname ?? "",
        role: machine?.role ?? "",
        hasDpu: machine?.hasDpu ?? false,
        specs: machine?.specs ?? { ...DEFAULT_SPECS },
      });
    }
  }, [open, machine]);

  function updateField<K extends keyof MachineEditorForm>(
    key: K,
    value: MachineEditorForm[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateSpec<K extends keyof MachineSpecs>(
    key: K,
    value: MachineSpecs[K],
  ) {
    setForm((prev) => ({
      ...prev,
      specs: { ...prev.specs, [key]: value },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.hostname.trim()) return;

    setIsSubmitting(true);
    try {
      let result: { machine: Machine } | { data: Machine };

      if (isEditing && machine) {
        result = await apiPut<{ machine: Machine }>(
          `/api/machines/${machine.id}`,
          {
            name: form.name.trim(),
            hostname: form.hostname.trim(),
            role: form.role.trim() || undefined,
            hasDpu: form.hasDpu,
            specs: form.specs,
          },
        );
        toast.success(`Machine "${form.name}" updated`);
      } else {
        result = await apiPost<{ data: Machine }>(
          "/api/machines/register",
          {
            name: form.name.trim(),
            hostname: form.hostname.trim(),
            role: form.role.trim() || "Worker Node",
            hasDpu: form.hasDpu,
            specs: form.specs,
          },
        );
        toast.success(`Machine "${form.name}" registered`);
      }

      // Handle different response shapes (register vs update)
      const savedMachine =
        "machine" in result ? result.machine : result.data;
      onSaved(savedMachine);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operation failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Machine" : "Register Machine"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update machine configuration."
              : `Register a new machine in the ${BRAND_NAME} network.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="machine-name">Name</Label>
            <Input
              id="machine-name"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="e.g., worker-node-01"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="machine-hostname">Hostname</Label>
            <Input
              id="machine-hostname"
              value={form.hostname}
              onChange={(e) => updateField("hostname", e.target.value)}
              placeholder="e.g., worker01.yourdomain.com"
              required
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="machine-role">Role</Label>
            <Input
              id="machine-role"
              value={form.role}
              onChange={(e) => updateField("role", e.target.value)}
              placeholder="e.g., Worker Node"
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="machine-has-dpu" className="font-medium">
                DPU Enabled
              </Label>
              <p className="text-xs text-muted-foreground">
                Hardware-enforced AI safety compliance
              </p>
            </div>
            <Switch
              id="machine-has-dpu"
              checked={form.hasDpu}
              onCheckedChange={(checked) =>
                updateField("hasDpu", checked)
              }
              disabled={isSubmitting}
            />
          </div>

          {/* Specs Section */}
          <div className="space-y-3 rounded-md border p-3">
            <Label className="font-medium text-sm">Hardware Specs</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="machine-specs-cpu"
                  className="text-xs"
                >
                  CPU
                </Label>
                <Input
                  id="machine-specs-cpu"
                  value={form.specs.cpu}
                  onChange={(e) => updateSpec("cpu", e.target.value)}
                  placeholder="AMD Ryzen 9"
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="machine-specs-ram"
                  className="text-xs"
                >
                  RAM
                </Label>
                <Input
                  id="machine-specs-ram"
                  value={form.specs.ram}
                  onChange={(e) => updateSpec("ram", e.target.value)}
                  placeholder="64GB"
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="machine-specs-gpu"
                  className="text-xs"
                >
                  GPU
                </Label>
                <Input
                  id="machine-specs-gpu"
                  value={form.specs.gpu}
                  onChange={(e) => updateSpec("gpu", e.target.value)}
                  placeholder="NVIDIA RTX 4090"
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="machine-specs-dpu"
                  className="text-xs"
                >
                  DPU
                </Label>
                <Input
                  id="machine-specs-dpu"
                  value={form.specs.dpu ?? ""}
                  onChange={(e) =>
                    updateSpec("dpu", e.target.value || null)
                  }
                  placeholder="BlueField-3"
                  disabled={isSubmitting}
                  className="h-8 text-xs"
                />
              </div>
            </div>
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
            <Button
              type="submit"
              disabled={
                isSubmitting ||
                !form.name.trim() ||
                !form.hostname.trim()
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : isEditing ? (
                "Save Changes"
              ) : (
                "Register Machine"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
