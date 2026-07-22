import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SecretsAuditEvent } from "@/types/secrets";

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

interface AuditLogRowProps {
  entry: SecretsAuditEvent;
  highlighted?: boolean;
}

export function AuditLogRow({ entry, highlighted }: AuditLogRowProps) {
  return (
    <TableRow
      className={cn(
        "h-8 transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
        highlighted && "bg-success/5 motion-safe:animate-fade-in",
      )}
      tabIndex={0}
      aria-label={`Audit event at ${entry.at}, ${entry.event}, ${entry.name}, by ${entry.actor}`}
    >
      <TableCell className="text-xs font-mono">{formatTime(entry.at)}</TableCell>
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
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
