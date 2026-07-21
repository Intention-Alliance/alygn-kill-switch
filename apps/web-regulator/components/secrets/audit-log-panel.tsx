"use client";

import { useState, useMemo } from "react";
import { History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SecretsAuditEvent } from "@/types/secrets";

interface AuditLogPanelProps {
  events: SecretsAuditEvent[];
  filter: string;
  onFilterChange: (value: string) => void;
  highlightedId?: string | null;
  className?: string;
}

const ACTION_BADGES: Record<
  SecretsAuditEvent["event"],
  "default" | "destructive" | "secondary" | "outline" | null
> = {
  rotate: "default",
  view: "secondary",
  "401-block": "destructive",
  "401-storm": "outline",
  "401": "destructive",
  sighup: "outline",
  poll: "outline",
  lock: "destructive",
  unlock: "default",
};

export function AuditLogPanel({
  events,
  filter,
  onFilterChange,
  highlightedId,
  className,
}: AuditLogPanelProps) {
  const [limit, setLimit] = useState(5);
  const filtered = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return events;
    return events.filter(
      (e) =>
        e.name.toLowerCase().includes(term) ||
        e.actor.toLowerCase().includes(term) ||
        e.event.toLowerCase().includes(term),
    );
  }, [events, filter]);

  const visible = filtered.slice(0, limit);

  return (
    <Card className={cn("sticky top-16 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-md border", className)}>
      <CardHeader className="p-4 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle className="text-sm font-semibold">Audit log</CardTitle>
          <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="audit-filter" className="sr-only">
            Filter audit log by secret name
          </label>
          <Input
            id="audit-filter"
            placeholder="Filter by secret name…"
            className="h-7 w-40 text-xs focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            aria-describedby="audit-filter-help"
          />
          <span id="audit-filter-help" className="sr-only">
            Filters as you type. Press Esc to clear.
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0" aria-live="polite" role="status">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit events yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="w-24 text-xs">Time</TableHead>
                  <TableHead className="w-24 text-xs">Action</TableHead>
                  <TableHead className="text-xs">Target</TableHead>
                  <TableHead className="text-xs">Actor</TableHead>
                  <TableHead className="text-xs">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((entry) => {
                  const isHighlighted = highlightedId === entry.id;
                  return (
                    <TableRow
                      key={entry.id}
                      className={cn(
                        "h-8 transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                        isHighlighted && "bg-success/5 motion-safe:animate-fade-in",
                      )}
                      tabIndex={0}
                      aria-label={`Audit event at ${entry.at}, ${entry.event}, ${entry.name}, by ${entry.actor}`}
                    >
                      <TableCell className="text-xs font-mono">
                        {formatTime(entry.at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={ACTION_BADGES[entry.event] ?? "outline"}
                          className="text-[10px] font-mono"
                        >
                          {entry.event}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-xs font-mono">
                        {entry.name}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{entry.actor}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.result ?? "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {filtered.length > limit && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full text-xs"
            onClick={() => setLimit((l) => l + 5)}
          >
            Load more
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
