"use client";

/**
 * FIDO2 Keys List — table of the current user's registered WebAuthn
 * credentials (ADR-143). Renders name, credential id (truncated),
 * transports, created date, and status. Row actions (Test / Rename /
 * Remove) are delegated to the parent via callbacks.
 */

import { Fingerprint, MoreHorizontal, Play, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Fido2Credential, WebAuthnTransport } from "@/types/fido2";

interface Fido2KeysListProps {
  credentials: Fido2Credential[];
  onTest: (credential: Fido2Credential) => void;
  onRename: (credential: Fido2Credential) => void;
  onRevoke: (credential: Fido2Credential) => void;
}

const TRANSPORT_LABELS: Record<WebAuthnTransport, string> = {
  usb: "USB",
  nfc: "NFC",
  ble: "BLE",
  internal: "Internal",
  hybrid: "Hybrid",
  cable: "Cable",
  "smart-card": "Smart Card",
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return s;
  }
}

function truncateId(id: string, max = 18): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max / 2)}…${id.slice(-max / 2)}`;
}

export function Fido2KeysList({
  credentials,
  onTest,
  onRename,
  onRevoke,
}: Fido2KeysListProps) {
  if (credentials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-md border bg-card py-16 text-center">
        <Fingerprint className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="text-base font-medium">No authenticators registered.</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Register your first hardware security key to enable hardware-backed
            admin authentication.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Credential ID</TableHead>
          <TableHead>Transports</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {credentials.map((cred) => {
          const revoked = Boolean(cred.revokedAt);
          return (
            <TableRow key={cred.id}>
              <TableCell className="font-medium">
                {cred.name ?? "Unnamed key"}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {truncateId(cred.id)}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {cred.transports.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    cred.transports.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">
                        {TRANSPORT_LABELS[t] ?? t}
                      </Badge>
                    ))
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {fmtDate(cred.createdAt)}
              </TableCell>
              <TableCell>
                {revoked ? (
                  <Badge variant="destructive">revoked</Badge>
                ) : (
                  <Badge variant="default">active</Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Actions for ${cred.name ?? "key"}`}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => onTest(cred)} disabled={revoked}>
                      <Play className="h-4 w-4 mr-2" aria-hidden="true" />
                      Test key
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onRename(cred)} disabled={revoked}>
                      <Pencil className="h-4 w-4 mr-2" aria-hidden="true" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onRevoke(cred)}
                      disabled={revoked}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
