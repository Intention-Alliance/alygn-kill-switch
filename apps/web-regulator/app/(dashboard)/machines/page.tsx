"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Server,
  CircleCheck,
  CircleAlert,
  CircleOff,
  Clock,
  Plus,
  Activity,
  Wifi,
  WifiOff,
  Loader2,
  Pencil,
  Flag,
  Skull,
  Shield,
} from "lucide-react";
import { DPUSecurityBanner } from "@/components/machines/dpu-security-banner";
import { MachineEditor } from "@/components/machines/machine-editor";
import { MachineFlagEditor } from "@/components/machines/machine-flag-editor";
import { MachineQuickActions } from "@/components/machines/machine-quick-actions";
import { ErrorBoundary, SectionErrorBoundary } from "@/components/error-boundary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiGet } from "@/lib/api-client";
import { effectiveStatus } from "@/lib/dashboard-utils";
import { BRAND_NAME } from "@/lib/branding";
import { toast } from "sonner";
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import type {
  Machine,
  MachineStatus as MachineStatusType,
  KillSwitchState,
} from "@/types/shared";

// ─── Types ────────────────────────────────────────────────────────

const STATUS_ICONS: Record<
  MachineStatusType,
  { icon: typeof CircleCheck; color: string; label: string }
> = {
  active: {
    icon: CircleCheck,
    color: "text-emerald-500",
    label: "Active",
  },
  inactive: {
    icon: CircleAlert,
    color: "text-amber-500",
    label: "Inactive",
  },
  offline: {
    icon: CircleOff,
    color: "text-red-500",
    label: "Offline",
  },
  pending: {
    icon: Clock,
    color: "text-amber-500",
    label: "Pending",
  },
};

interface MachinesResponse {
  data: Machine[];
  total: number;
  limit: number;
  offset: number;
}

// Per-machine flags payload (contract § 3.1). Kept local to this page;
// the canonical type lives in `components/machines/machine-flag-editor.tsx`.
interface MachineFlagEntry {
  key: string;
  value: boolean | number | string;
  type: "boolean" | "number" | "string";
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

export default function MachinesDashboardPage() {
  const router = useRouter();
  const { machines: wsMachines, isConnected, status } = useKillSwitchWebSocket();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | undefined>();

  // ─── v1.1: per-row action sheet/dialog state ──────────────────
  const [actionsFor, setActionsFor] = useState<Machine | null>(null);
  const [flagEditorFor, setFlagEditorFor] = useState<Machine | null>(null);

  // ─── v1.1: resolved flag values for the selected machine ─────────
  const [resolvedFlags, setResolvedFlags] = useState<MachineFlagEntry[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [flagsError, setFlagsError] = useState<string | null>(null);

  // ─── Fetch machines on mount ──────────────────────────────────

  const fetchMachines = useCallback(async () => {
    try {
      const data = await apiGet<MachinesResponse>("/api/machines");
      setMachines(data.data ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch machines",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  // ─── Use WebSocket machines when connected ─────────────────────

  useEffect(() => {
    if (isConnected && wsMachines.length > 0) {
      setMachines(wsMachines);
    }
  }, [wsMachines, isConnected]);

  // ─── v1.1: fetch resolved flag values for the selected machine ─
  useEffect(() => {
    if (!selectedMachine) {
      setResolvedFlags([]);
      setFlagsError(null);
      return;
    }
    let cancelled = false;
    setFlagsLoading(true);
    setFlagsError(null);
    apiGet<MachineFlagsResponse>(
      `/api/machines/${selectedMachine.id}/flags`,
    )
      .then((data) => {
        if (!cancelled) setResolvedFlags(data.flags ?? []);
      })
      .catch((err) => {
        if (!cancelled) {
          setFlagsError(
            err instanceof Error ? err.message : "Failed to load flags",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setFlagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMachine]);

  // ─── Handlers ──────────────────────────────────────────────────

  function handleSaved(machine: Machine) {
    setMachines((prev) => {
      const existing = prev.find((m) => m.id === machine.id);
      if (existing) {
        return prev.map((m) => (m.id === machine.id ? machine : m));
      }
      return [...prev, machine];
    });
    toast.success(`Machine "${machine.name}" saved`);
  }

  function openCreate() {
    setEditingMachine(undefined);
    setEditorOpen(true);
  }

  function openEdit(machine: Machine) {
    setEditingMachine(machine);
    setEditorOpen(true);
  }

  // ─── Stats ─────────────────────────────────────────────────────

  const activeCount = machines.filter(
    (m) => effectiveStatus(m) === "active",
  ).length;
  const inactiveCount = machines.filter(
    (m) => effectiveStatus(m) === "inactive",
  ).length;
  const offlineCount = machines.filter(
    (m) => effectiveStatus(m) === "offline",
  ).length;
  const pendingCount = machines.filter(
    (m) => effectiveStatus(m) === "pending",
  ).length;

  // ─── Loading State ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // ─── Error State ───────────────────────────────────────────────

  if (error && machines.length === 0) {
    return (
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center"
        role="alert"
        aria-live="assertive"
      >
        <Server className="mx-auto h-10 w-10 text-destructive/50" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-destructive">
          Failed to Load Machines
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={fetchMachines}
        >
          Retry
        </Button>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* WebSocket Connection Notice */}
        <ConnectionNotice isConnected={isConnected} />

        {/* Page Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Server className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">
                Machines Dashboard
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Node registry — monitor connected machines in the {BRAND_NAME}
              network
            </p>
          </div>

          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Machine
          </Button>
        </div>

        <Separator />

        {/* Stats Overview */}
        <SectionErrorBoundary title="Stats">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Machines
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {machines.length}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Active
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">
                  {activeCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Inactive
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500">
                  {inactiveCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Offline
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">
                  {offlineCount}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500">
                  {pendingCount}
                </div>
              </CardContent>
            </Card>
          </div>
        </SectionErrorBoundary>

        {/* Machines List + Detail */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Machines Table */}
          <div className="lg:col-span-2">
            <SectionErrorBoundary title="Machines Table">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">
                    Registered Machines
                  </CardTitle>
                  <CardDescription>
                    All nodes in the {BRAND_NAME} network
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {machines.length === 0 ? (
                    <div className="py-8 text-center">
                      <Server className="mx-auto h-8 w-8 text-muted-foreground/50" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        No machines registered yet
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={openCreate}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Register your first machine
                      </Button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Hostname</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead className="w-24">
                              Status
                            </TableHead>
                            <TableHead className="w-44">
                              Last Seen
                            </TableHead>
                            <TableHead className="w-56 text-right">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {machines.map((machine) => {
                            const status = effectiveStatus(machine);
                            const StatusIcon =
                              STATUS_ICONS[status].icon;
                            const statusColor =
                              STATUS_ICONS[status].color;

                            return (
                              <TableRow
                                key={machine.id}
                                className={cn(
                                  "cursor-pointer",
                                  selectedMachine?.id ===
                                    machine.id && "bg-muted/50",
                                )}
                                onClick={() =>
                                  router.push(
                                    `/machines/${machine.id}`,
                                  )
                                }
                              >
                                <TableCell className="font-medium">
                                  {machine.name}
                                </TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  {machine.hostname}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {machine.role}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "gap-1",
                                      statusColor,
                                    )}
                                  >
                                    <StatusIcon className="h-3 w-3" />
                                    {
                                      STATUS_ICONS[status]
                                        .label
                                    }
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatTimeAgo(
                                      machine.lastSeen,
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell
                                  className="text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 gap-1 text-destructive border-destructive/40 hover:bg-destructive/10"
                                      onClick={() => setActionsFor(machine)}
                                      aria-label={`Kill ${machine.name}`}
                                      title="Open kill-switch Quick Actions for this machine"
                                    >
                                      <Skull className="h-3 w-3" />
                                      <span className="hidden sm:inline">
                                        Kill
                                      </span>
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 gap-1"
                                      onClick={() => setFlagEditorFor(machine)}
                                      aria-label={`Manage flags for ${machine.name}`}
                                      title="Open per-machine flag overrides"
                                    >
                                      <Flag className="h-3 w-3" />
                                      <span className="hidden sm:inline">
                                        Flags
                                      </span>
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </SectionErrorBoundary>
          </div>

          {/* Machine Detail Panel */}
          <div>
            {selectedMachine ? (
              <SectionErrorBoundary title="Machine Details">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-lg">
                      Machine Details
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => openEdit(selectedMachine)}
                      aria-label={`Edit machine ${selectedMachine.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Name
                      </p>
                      <p className="font-semibold">
                        {selectedMachine.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Hostname
                      </p>
                      <p className="font-mono text-sm">
                        {selectedMachine.hostname}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Role
                      </p>
                      <p>{selectedMachine.role}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </p>
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-1 gap-1",
                          STATUS_ICONS[
                            effectiveStatus(selectedMachine)
                          ].color,
                        )}
                      >
                        {(() => {
                          const S =
                            STATUS_ICONS[
                              effectiveStatus(selectedMachine)
                            ];
                          return (
                            <>
                              <S.icon className="h-3 w-3" />
                              {S.label}
                            </>
                          );
                        })()}
                      </Badge>
                    </div>

                    <Separator />

                    {/* DPU Security Banner — uses actual hasDpu */}
                    <DPUSecurityBanner
                      machineName={selectedMachine.name}
                      hasDPU={selectedMachine.hasDpu}
                    />

                    {/* Resource usage — from heartbeat data */}
                    {selectedMachine.cpuUsage !==
                      undefined && (
                      <>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <Activity className="h-3 w-3" />{" "}
                            CPU Usage
                          </p>
                          <div className="mt-2 h-2 w-full rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-emerald-500 transition-all"
                              style={{
                                width: `${selectedMachine.cpuUsage}%`,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedMachine.cpuUsage}%
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <Activity className="h-3 w-3" />{" "}
                            Memory Usage
                          </p>
                          <div className="mt-2 h-2 w-full rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-blue-500 transition-all"
                              style={{
                                width: `${selectedMachine.memoryUsage}%`,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {selectedMachine.memoryUsage}%
                          </p>
                        </div>
                      </>
                    )}

                    <Separator />

                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Created
                      </p>
                      <p className="text-sm">
                        {selectedMachine.createdAt
                          ? new Date(
                              selectedMachine.createdAt,
                            ).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Last Seen
                      </p>
                      <p className="text-sm">
                        {formatTimeAgo(selectedMachine.lastSeen)}
                      </p>
                    </div>

                    <Separator />

                    {/* v1.1: Resolved per-machine flags */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Flag className="h-3 w-3" /> Resolved Flags
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setFlagEditorFor(selectedMachine)}
                        >
                          Manage
                        </Button>
                      </div>
                      {flagsLoading ? (
                        <div className="space-y-1.5">
                          {[...Array(5)].map((_, i) => (
                            <Skeleton key={i} className="h-7 w-full" />
                          ))}
                        </div>
                      ) : flagsError ? (
                        <p className="text-xs text-destructive">{flagsError}</p>
                      ) : resolvedFlags.length === 0 ||
                        resolvedFlags.every((f) => !f.overridden) ? (
                        <p className="text-xs text-muted-foreground italic">
                          All flags using global values
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {resolvedFlags.map((f) => (
                            <li
                              key={f.key}
                              className="flex items-center justify-between rounded-md border bg-muted/30 px-2 py-1.5 text-xs"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <code className="font-mono text-[11px] truncate">
                                  {f.key}
                                </code>
                                {f.overridden && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] h-3.5 px-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
                                  >
                                    override
                                  </Badge>
                                )}
                              </div>
                              <span className="font-mono text-foreground shrink-0">
                                {String(f.value)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </SectionErrorBoundary>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Server className="h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Select a machine to view details
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Machine Editor Dialog */}
        <MachineEditor
          machine={editingMachine}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSaved={handleSaved}
        />

        {/* v1.1: per-row Quick Actions (kill-switch) sheet. Wraps
            MachineQuickActions in a side panel so the user can review
            the machine context while triggering a state change. State
            changes are global (not per-machine) per contract § 9. */}
        <Sheet
          open={actionsFor !== null}
          onOpenChange={(open) => {
            if (!open) setActionsFor(null);
          }}
        >
          <SheetContent
            side="right"
            className="w-full sm:max-w-md flex flex-col gap-4"
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                Kill-Switch Quick Actions
              </SheetTitle>
              <SheetDescription>
                {actionsFor
                  ? `Apply a global kill-switch state change. Currently viewing: ${actionsFor.name}.`
                  : "Apply a global kill-switch state change."}
              </SheetDescription>
            </SheetHeader>
            {actionsFor && (
              <div className="rounded-md bg-muted/30 p-3 text-sm space-y-1">
                <p className="font-medium">{actionsFor.name}</p>
                <p className="text-xs text-muted-foreground font-mono">
                  {actionsFor.hostname} · {actionsFor.role}
                </p>
              </div>
            )}
            <MachineQuickActions
              currentState={status?.state ?? "ARMED"}
              onStateChange={() => {
                // The component already POSTs and toasts. Close the sheet
                // on a successful state change so the user sees fresh data.
                setActionsFor(null);
              }}
            />
          </SheetContent>
        </Sheet>

        {/* v1.1: per-row Manage Flags dialog. Reuses MachineFlagEditor
            (which renders its own <Dialog>). The component is mounted
            only when a target machine is selected, so its internal fetch
            triggers on open. */}
        {flagEditorFor && (
          <MachineFlagEditor
            machineId={flagEditorFor.id}
            machineName={flagEditorFor.name}
            open={true}
            onOpenChange={(o) => {
              if (!o) setFlagEditorFor(null);
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

// ─── Connection Notice ───────────────────────────────────────────

function ConnectionNotice({ isConnected }: { isConnected: boolean }) {
  if (isConnected) {
    return (
      <div
        className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400"
        role="status"
        aria-live="polite"
      >
        <Wifi className="h-3.5 w-3.5" />
        <span>Live — WebSocket connected</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-2 text-sm text-amber-600 dark:text-amber-400"
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>WS disconnected, using polling fallback</span>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTimeAgo(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return "—";

  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "—";

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
