import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { fetchFullAudit } from "../actions";
import { AuditLogRow } from "@/components/secrets/audit-log-row";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SecretsAuditEvent } from "@/types/secrets";

export const metadata = {
  title: "Audit | Secrets | AdminUI",
};

export default async function SecretsAuditPage() {
  let events: SecretsAuditEvent[];
  try {
    events = await fetchFullAudit();
  } catch {
    events = [];
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/admin/secrets"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to Secrets</span>
        </Link>
      </div>

      <Card className="rounded-md border">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">
              Secrets audit log
            </CardTitle>
            <Badge variant="secondary" className="text-xs">
              {events.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audit events yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="w-full">
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="w-24 text-xs">Time</TableHead>
                    <TableHead className="w-24 text-xs">Event</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Actor</TableHead>
                    <TableHead className="text-xs">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((entry) => (
                    <AuditLogRow key={entry.id} entry={entry} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
