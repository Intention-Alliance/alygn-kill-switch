"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SecretRow } from "./secret-row";
import { SkeletonRow } from "./skeleton-row";
import type { SecretInfo } from "@/types/secrets";

interface SecretsListProps {
  secrets: SecretInfo[];
  rotatingName?: string | null;
  lockedNames: Set<string>;
  onRotate: (secret: SecretInfo) => void;
  isLoading?: boolean;
  rotateButtonRef?: (name: string, el: HTMLButtonElement | null) => void;
}

export function SecretsList({
  secrets,
  rotatingName,
  lockedNames,
  onRotate,
  isLoading,
  rotateButtonRef,
}: SecretsListProps) {
  return (
    <Card className="rounded-md border">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold">Secrets</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 overflow-x-auto">
        <div className="overflow-x-auto rounded-md border">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="h-8">
                <TableHead className="w-[280px] text-xs">Name</TableHead>
                <TableHead className="w-[200px] text-xs">Value</TableHead>
                <TableHead className="w-[120px] text-xs">Age</TableHead>
                <TableHead className="w-[140px] text-xs">{secrets.length > 0 && lockedNames.has(secrets[0]?.name ?? "") ? "State" : "Files"}</TableHead>
                <TableHead className="w-[100px] text-xs">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow delay="75" />
                  <SkeletonRow delay="150" />
                </>
              ) : secrets.length === 0 ? (
                <TableRow className="h-24">
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No Tailscale secrets yet.
                  </TableCell>
                </TableRow>
              ) : (
                secrets.map((secret) => (
                  <SecretRow
                    key={secret.name}
                    secret={secret}
                    isLocked={lockedNames.has(secret.name)}
                    isRotating={rotatingName === secret.name}
                    onRotate={onRotate}
                    rotateButtonRef={rotateButtonRef}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
