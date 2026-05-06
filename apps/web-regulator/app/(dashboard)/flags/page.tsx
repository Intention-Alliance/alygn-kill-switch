"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Plus, Pencil, Trash2, Loader2, Shield } from "lucide-react";
import { ErrorBoundary, SectionErrorBoundary } from "@/components/error-boundary";
import { FlagEditor } from "@/components/flags/flag-editor";
import { FlagStatusBadge } from "@/components/flags/flag-status-badge";
import { AuditLog } from "@/components/flags/audit-log";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { apiGet, apiPut, apiDelete } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Flag as FlagType } from "@/types/shared";

// The backend returns flags with a slightly different shape
interface BackendFlag {
  id: string;
  key: string;
  value: boolean;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function FlagsDashboardPage() {
  const [flags, setFlags] = useState<FlagType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FlagType | undefined>();
  const [deletingFlag, setDeletingFlag] = useState<FlagType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    try {
      const data = await apiGet<{ flags: BackendFlag[] }>("/api/flags");
      // Adapt backend format to shared-types Flag
      const adapted: FlagType[] = (data.flags ?? []).map((f) => ({
        id: f.id,
        name: f.key,
        key: f.key,
        description: f.description ?? "",
        enabled: f.enabled,
        value: f.value,
        segments: [],
        rolloutPercentage: 100,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        updatedBy: f.createdBy ?? "api",
      }));
      setFlags(adapted);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch flags");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlags();

    // Poll every 10s
    const interval = setInterval(fetchFlags, 10_000);
    return () => clearInterval(interval);
  }, [fetchFlags]);

  async function handleToggleFlag(flag: FlagType) {
    try {
      await apiPut(`/api/flags/${flag.id}`, {
        enabled: !flag.enabled,
      });
      setFlags((prev) =>
        prev.map((f) =>
          f.id === flag.id ? { ...f, enabled: !f.enabled } : f,
        ),
      );
      toast.success(
        `Flag "${flag.key}" ${flag.enabled ? "disabled" : "enabled"}`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to toggle flag",
      );
    }
  }

  async function handleDeleteFlag() {
    if (!deletingFlag) return;
    setIsDeleting(true);

    try {
      await apiDelete(`/api/flags/${deletingFlag.id}`);
      setFlags((prev) => prev.filter((f) => f.id !== deletingFlag.id));
      toast.success(`Flag "${deletingFlag.key}" deleted`);
      if (selectedFlagId === deletingFlag.id) {
        setSelectedFlagId(null);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete flag",
      );
    } finally {
      setIsDeleting(false);
      setDeletingFlag(null);
    }
  }

  function handleSaved(flag: FlagType) {
    setFlags((prev) => {
      const existing = prev.find((f) => f.id === flag.id);
      if (existing) {
        return prev.map((f) => (f.id === flag.id ? flag : f));
      }
      return [...prev, flag];
    });
  }

  function openCreate() {
    setEditingFlag(undefined);
    setEditorOpen(true);
  }

  function openEdit(flag: FlagType) {
    setEditingFlag(flag);
    setEditorOpen(true);
  }

  const filteredFlags = searchQuery
    ? flags.filter(
        (f) =>
          f.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
          f.description?.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : flags;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error && flags.length === 0) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
        <Flag className="mx-auto h-10 w-10 text-destructive/50" />
        <h2 className="mt-4 text-lg font-semibold text-destructive">
          Failed to Load Flags
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={fetchFlags}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Flag className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">
                Flag Management
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Manage feature flags and rollout configuration
            </p>
          </div>

          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create Flag
          </Button>
        </div>

        <Separator />

        {/* Search */}
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search flags…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs"
          />
          <Badge variant="secondary" className="text-xs">
            {filteredFlags.length} / {flags.length} flags
          </Badge>
        </div>

        {/* Flags Table */}
        <SectionErrorBoundary title="Flags Table">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">All Flags</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredFlags.length === 0 ? (
                <div className="py-8 text-center">
                  <Flag className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {searchQuery
                      ? "No flags match your search"
                      : "No flags created yet"}
                  </p>
                  {!searchQuery && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={openCreate}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Create your first flag
                    </Button>
                  )}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Flag Key</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-24">Status</TableHead>
                        <TableHead className="w-20">Value</TableHead>
                        <TableHead className="w-32">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFlags.map((flag) => (
                        <TableRow
                          key={flag.id}
                          className={cn(
                            "cursor-pointer",
                            selectedFlagId === flag.id &&
                              "bg-muted/50",
                          )}
                          onClick={() =>
                            setSelectedFlagId(
                              selectedFlagId === flag.id ? null : flag.id,
                            )
                          }
                        >
                          <TableCell className="font-mono text-sm font-medium">
                            {flag.key}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                            {flag.description || "—"}
                          </TableCell>
                          <TableCell>
                            <FlagStatusBadge flag={flag} />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={Boolean(flag.value)}
                              onCheckedChange={() => handleToggleFlag(flag)}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  openEdit(flag);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={(e: React.MouseEvent) => {
                                  e.stopPropagation();
                                  setDeletingFlag(flag);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        {/* Audit Log for Selected Flag */}
        {selectedFlagId && (
          <SectionErrorBoundary title="Audit Log">
            <AuditLog flagId={selectedFlagId} limit={30} />
          </SectionErrorBoundary>
        )}

        {/* Flag Editor Dialog */}
        <FlagEditor
          flag={editingFlag}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSaved={handleSaved}
        />

        {/* Delete Confirmation */}
        <AlertDialog
          open={!!deletingFlag}
          onOpenChange={() => setDeletingFlag(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Flag</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete flag{" "}
                <strong>{deletingFlag?.key}</strong>? This action cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  handleDeleteFlag();
                }}
                disabled={isDeleting}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting…
                  </>
                ) : (
                  "Delete Flag"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ErrorBoundary>
  );
}
