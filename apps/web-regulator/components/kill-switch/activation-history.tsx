"use client";

import { useState, useEffect } from "react";
import { History } from "lucide-react";
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
import type { ActivationRecord } from "@/types/shared";

interface ActivationHistoryProps {
  limit?: number;
  className?: string;
  /** Records from WebSocket hook — if provided, skips API fetch */
  webSocketRecords?: ActivationRecord[];
}

export function ActivationHistory({
  limit = 20,
  className,
  webSocketRecords,
}: ActivationHistoryProps) {
  const [records, setRecords] = useState<ActivationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(!webSocketRecords);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If WebSocket provides records, use them directly (only when non-empty;
    // an empty array means the WS hasn't delivered history yet — fall through
    // to the API so the table is never stuck empty).
    if (webSocketRecords && webSocketRecords.length > 0) {
      setRecords(webSocketRecords.slice(0, limit));
      setIsLoading(false);
      return;
    }

    // Otherwise fall back to API fetch
    let cancelled = false;

    async function fetchHistory() {
      try {
        const data = await apiGet<{
          data: ActivationRecord[];
        }>(`/api/kill-switch/activations?limit=${limit}`);
        if (!cancelled) {
          setRecords(data.data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load history");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchHistory();

    const interval = setInterval(fetchHistory, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [limit, webSocketRecords]);

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error && !webSocketRecords) {
    return (
      <div className={cn("rounded-md bg-destructive/5 p-4 text-sm text-destructive", className)}>
        Failed to load activation history: {error}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Activation History</h3>
        <Badge variant="secondary" className="ml-2 text-xs">
          {records.length}
        </Badge>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No activation events recorded yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Transition</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead className="w-28">Trace ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="text-xs font-mono">
                    {new Date(record.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs">{record.user}</TableCell>
                  <TableCell className="text-xs">
                    <StateBadge state={record.previousState} />
                    <span className="mx-1 text-muted-foreground">→</span>
                    <StateBadge state={record.newState} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {record.reason}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {record.traceId.slice(0, 8)}
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

function StateBadge({ state }: { state: string }) {
  const variantMap: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
    ARMED: "default",
    RUNNING: "outline",
    STOPPING: "secondary",
    STOPPED: "destructive",
    LOCKED: "secondary",
  };

  return (
    <Badge variant={variantMap[state] ?? "outline"} className="text-[10px]">
      {state}
    </Badge>
  );
}
