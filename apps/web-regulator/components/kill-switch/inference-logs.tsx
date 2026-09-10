"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet } from "@/lib/api-client";

// ─── Inference log entry (GET /v1/inference-logs) ──────────────────────

export interface InferenceLogEntry {
  id: string;
  timestamp: string;
  machineId: string;
  method: string;
  path: string;
  score: number;
  action: "forward" | "block" | "escalate";
  reasons: string[];
  alert: boolean;
  scored: boolean;
  promptPreview: string | null;
  model: string | null;
}

interface InferenceLogsResponse {
  logs: InferenceLogEntry[];
  total: number;
}

const ACTION_VARIANT: Record<
  string,
  "default" | "destructive" | "secondary" | "outline"
> = {
  forward: "default",
  escalate: "secondary",
  block: "destructive",
};

// ─── Component ──────────────────────────────────────────────────────────

export function InferenceLogs({
  limit = 25,
  className,
}: {
  limit?: number;
  className?: string;
}) {
  const [logs, setLogs] = useState<InferenceLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await apiGet<InferenceLogsResponse>(
        `/api/inference-logs?limit=${limit}`,
      );
      setLogs(data.logs ?? []);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load inference logs",
      );
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Inference Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ScrollText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Inference Logs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No intercepted requests yet. The agent-plane interceptor reports
            them here as traffic flows.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead className="w-20">Score</TableHead>
                  <TableHead className="w-24">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.machineId}
                    </TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs">
                      <span className="font-mono">{log.method}</span> {log.path}
                      {log.alert && (
                        <Badge
                          variant="destructive"
                          className="ml-2 h-4 text-[10px]"
                        >
                          alert
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.scored ? log.score.toFixed(2) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={ACTION_VARIANT[log.action] ?? "secondary"}
                        className="h-4 text-[10px]"
                      >
                        {log.action}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
