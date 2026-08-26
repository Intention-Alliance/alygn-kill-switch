"use client";

import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import type { ActivationRecord, KillSwitchState } from "@/types/shared";

interface MachineLogsProps {
  machineId: string;
  auditLog: ActivationRecord[];
  className?: string;
}

// ─── Machine audit log API response shape ────────────────────────────
// GET /v1/machines/:id/audit → { data: MachineAuditEntry[], ... }
interface MachineAuditEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  reason: string | null;
  previousState: string | null;
  newState: string | null;
  traceId: string | null;
  machineId: string | null;
  severity: string | null;
  metadata: unknown;
}

interface MachineAuditResponse {
  data: MachineAuditEntry[];
}

// ─── Adapt a machine-audit entry to the shared ActivationRecord shape ──
function adaptAuditEntry(entry: MachineAuditEntry): ActivationRecord {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    user: entry.userId ?? "system",
    reason: entry.reason ?? "",
    previousState: (entry.previousState as KillSwitchState) ?? "ARMED",
    newState: (entry.newState as KillSwitchState) ?? "ARMED",
    traceId: entry.traceId ?? "",
  };
}

const STATE_BADGE_VARIANT: Record<
  KillSwitchState,
  "default" | "destructive" | "secondary" | "outline"
> = {
  ARMED: "default",
  RUNNING: "outline",
  STOPPING: "secondary",
  STOPPED: "destructive",
  LOCKED: "secondary",
};

function StateBadge({ state }: { state: KillSwitchState }) {
  return (
    <Badge
      variant={STATE_BADGE_VARIANT[state] ?? "outline"}
      className="text-[10px] px-1.5 py-0 h-5 shadow-none"
    >
      {state}
    </Badge>
  );
}

export function MachineLogs({
  machineId,
  auditLog,
  className,
}: MachineLogsProps) {
  // Machine-specific logs fetched from the kill-switch API
  // (GET /v1/machines/:id/audit). The WS audit log only carries global
  // state-change events; machine-scoped entries (automated kills, integrity
  // events) live in the DB and must be fetched explicitly.
  const [machineLogs, setMachineLogs] = useState<ActivationRecord[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadMachineLogs() {
      try {
        const res = await apiGet<MachineAuditResponse>(
          `/api/machines/${encodeURIComponent(machineId)}/audit?limit=50`,
        );
        if (!cancelled) {
          setMachineLogs((res.data ?? []).map(adaptAuditEntry));
        }
      } catch {
        // Machine audit endpoint may be unavailable — keep the WS log only.
        if (!cancelled) setMachineLogs([]);
      }
    }

    loadMachineLogs();
    return () => {
      cancelled = true;
    };
  }, [machineId]);

  // Merge WS-delivered entries with DB-fetched machine logs, deduped by id.
  // Machine-scoped entries from the API take precedence; global WS events
  // (no machineId) are also shown so the panel isn't empty.
  const merged = [...machineLogs, ...auditLog].filter((entry, index, arr) => {
    const augmented = entry as ActivationRecord & { machineId?: string };
    const isForThisMachine =
      augmented.machineId === machineId ||
      augmented.machineId === undefined;
    if (!isForThisMachine) return false;
    // Dedupe by id (keep the first occurrence — API entries come first).
    return arr.findIndex((e) => e.id === entry.id) === index;
  });

  const filtered = merged;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <ScrollText className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          Activity Log
        </h3>
        <Badge variant="secondary" className="text-[10px] ml-auto">
          {filtered.length}
        </Badge>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border/50 rounded-md">
          <ScrollText className="size-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">
            No logs for this machine
          </p>
        </div>
      ) : (
        <div className="rounded-md border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="border-border/50">
                <TableHead>Timestamp</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Transition</TableHead>
                <TableHead className="hidden sm:table-cell">Reason</TableHead>
                <TableHead className="text-right">Trace ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow
                  key={entry.id}
                  className="border-border/50 hover:bg-muted/50 transition-colors"
                >
                  <TableCell className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs font-medium capitalize">
                    {entry.newState === "STOPPED"
                      ? "Emergency Stop"
                      : entry.newState === "STOPPING"
                        ? "Stopping"
                        : entry.newState === "ARMED"
                          ? "Armed"
                          : entry.newState === "RUNNING"
                            ? "Running"
                            : entry.newState === "LOCKED"
                              ? "Locked"
                              : "State Change"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <StateBadge state={entry.previousState} />
                      <span className="text-[10px] text-muted-foreground">
                        →
                      </span>
                      <StateBadge state={entry.newState} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground max-w-[180px] truncate">
                    {entry.reason || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[10px] text-muted-foreground">
                    {entry.traceId.slice(0, 12)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
