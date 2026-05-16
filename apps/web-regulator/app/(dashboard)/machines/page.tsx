"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { DPUSecurityBanner } from "@/components/machines/dpu-security-banner";
import { MachineEditor } from "@/components/machines/machine-editor";
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
import { apiGet } from "@/lib/api-client";
import { toast } from "sonner";
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import type {
  Machine,
  MachineStatus as MachineStatusType,
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
};

interface MachinesResponse {
  data: Machine[];
  total: number;
  limit: number;
  offset: number;
}

export default function MachinesDashboardPage() {
  const { machines: wsMachines, isConnected } = useKillSwitchWebSocket();

  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | undefined>();

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
    (m) => m.status === "active",
  ).length;
  const inactiveCount = machines.filter(
    (m) => m.status === "inactive",
  ).length;
  const offlineCount = machines.filter(
    (m) => m.status === "offline",
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
              Node registry — monitor connected machines in the ALYGN
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
          <div className="grid gap-4 sm:grid-cols-4">
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
                    All nodes in the ALYGN network
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
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {machines.map((machine) => {
                            const StatusIcon =
                              STATUS_ICONS[machine.status].icon;
                            const statusColor =
                              STATUS_ICONS[machine.status].color;

                            return (
                              <TableRow
                                key={machine.id}
                                className={cn(
                                  "cursor-pointer",
                                  selectedMachine?.id ===
                                    machine.id && "bg-muted/50",
                                )}
                                onClick={() =>
                                  setSelectedMachine(
                                    selectedMachine?.id ===
                                      machine.id
                                      ? null
                                      : machine,
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
                                      STATUS_ICONS[machine.status]
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
                          STATUS_ICONS[selectedMachine.status]
                            .color,
                        )}
                      >
                        {(() => {
                          const S =
                            STATUS_ICONS[
                              selectedMachine.status
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
