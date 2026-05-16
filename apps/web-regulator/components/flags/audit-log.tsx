"use client";

import { useState, useEffect } from "react";
import { FileText } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiGet } from "@/lib/api-client";
import type { AuditEntry } from "@/types/shared";

interface AuditLogProps {
  flagId?: string;
  limit?: number;
  className?: string;
}

const ACTION_BADGES: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  created: "default",
  updated: "outline",
  deleted: "destructive",
};

export function AuditLog({ flagId, limit, className }: AuditLogProps) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      try {
        const endpoint = flagId
          ? `/api/flags/${flagId}/audit`
          : "/api/flags/audit";

        const data = await apiGet<{ logs: AuditEntry[] }>(endpoint);
        if (!cancelled) {
          setLogs(data.logs?.slice(0, limit) ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load audit log",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [flagId, limit]);

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "rounded-md bg-destructive/5 p-4 text-sm text-destructive",
          className,
        )}
        role="alert"
        aria-live="polite"
      >
        {error}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Audit Log</h3>
        <Badge variant="secondary" className="text-xs">
          {logs.length}
        </Badge>
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit events yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">Timestamp</TableHead>
                <TableHead className="w-24">Action</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Flag ID</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs font-mono">
                    {new Date(entry.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={ACTION_BADGES[entry.action] ?? "outline"}
                      className="text-[10px]"
                    >
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{entry.userId}</TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {entry.flagId?.slice(0, 8) ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px] truncate">
                    {entry.oldValue && entry.newValue ? (
                      <span>
                        <span className="text-red-400 line-through">
                          {truncate(entry.oldValue, 30)}
                        </span>{" "}
                        →{" "}
                        <span className="text-green-400">
                          {truncate(entry.newValue, 30)}
                        </span>
                      </span>
                    ) : (
                      entry.newValue ?? entry.oldValue ?? "—"
                    )}
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

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "…" : str;
}


