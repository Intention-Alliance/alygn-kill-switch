"use client";

import { useState, useMemo } from "react";
import { History } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { AuditLogRow } from "./audit-log-row";
import type { SecretsAuditEvent } from "@/types/secrets";

interface AuditLogPanelProps {
  events: SecretsAuditEvent[];
  filter: string;
  onFilterChange: (value: string) => void;
  highlightedId?: string | null;
  className?: string;
}

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
          <Link
            href="/admin/secrets/audit"
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
          >
            View all →
          </Link>
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
            onKeyDown={(e) => {
              if (e.key === "Escape" && filter) {
                e.preventDefault();
                onFilterChange("");
              }
            }}
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
                {visible.map((entry) => (
                  <AuditLogRow
                    key={entry.id}
                    entry={entry}
                    highlighted={highlightedId === entry.id}
                  />
                ))}
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
