"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, Plus, Pencil, Trash2, Loader2, Shield, WifiOff, Wifi, AlertTriangle } from "lucide-react";
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
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import type { Flag as FlagType } from "@/types/shared";

// ─── ADR-133 Predefined Flags ──────────────────────────────────────

const PREDEFINED_FLAGS = [
  {
    key: "llm_interception_enabled",
    type: "boolean",
    description:
      "Master toggle for LLM request interception. When false, all requests pass through unscored. Toggle per-machine for granular control.",
  },
  {
    key: "auto_stop_threshold",
    type: "number",
    description:
      "Score threshold for automatic blocking (0.0–1.0). Lower values = stricter blocking. Set to 1.0 to disable auto-blocking while still logging scores.",
  },
  {
    key: "damage_logging_level",
    type: "string",
    description:
      "Verbosity: minimal (blocked only), standard (blocked + near-threshold), verbose (all scored). Higher levels increase storage usage.",
  },
  {
    key: "alert_on_critical_score",
    type: "boolean",
    description:
      "Desktop notification on critical events when request score exceeds 0.9. Early warning before auto-stop triggers.",
  },
  {
    key: "request_sampling_rate",
    type: "number",
    description:
      "Percentage of requests to sample (0.0–1.0). At 1.0 every request is scored. Lower values reduce CPU load but create blind spots.",
  },
];

// The scoring engine is not implemented. These flags are stored/editable but
// have no runtime effect. Flagged in the UI so admins aren't misled.
const SCORING_FLAG_KEYS = new Set([
  "auto_stop_threshold",
  "alert_on_critical_score",
  "request_sampling_rate",
]);

// The backend returns flags with a slightly different shape
interface BackendFlag {
  id: string;
  key: string;
  value: boolean | string | number;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function FlagsDashboardPage() {
  const { flags: wsFlags, isConnected } = useKillSwitchWebSocket();

  const [flags, setFlags] = useState<FlagType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FlagType | undefined>();
  const [deletingFlag, setDeletingFlag] = useState<FlagType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFlagId, setSelectedFlagId] = useState<string | null>(null);

  // Initial fetch — only run on mount
  const fetchFlags = useCallback(async () => {
    try {
      const data = await apiGet<{ flags: BackendFlag[] }>("/api/flags");
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

  // Fetch once on mount
  useEffect(() => {
    fetchFlags();
  }, [fetchFlags]);

  // Use WebSocket flags when connected; keep current if disconnected
  useEffect(() => {
    if (isConnected && wsFlags.length > 0) {
      setFlags(wsFlags);
    }
  }, [wsFlags, isConnected]);

  async function handleToggleFlag(flag: FlagType) {
    // F5: the Value switch toggles the flag VALUE (booleans only), not the
    // enabled state. Non-boolean flags render a plain value readout instead
    // of a switch, so this handler only ever sees boolean values.
    const nextValue = !Boolean(flag.value);
    try {
      await apiPut(`/api/flags/${flag.id}`, {
        value: nextValue,
      });
      setFlags((prev) =>
        prev.map((f) =>
          f.id === flag.id ? { ...f, value: nextValue } : f,
        ),
      );
      toast.success(`Flag "${flag.key}" value set to ${nextValue}`);
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
      <div
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center"
        role="alert"
        aria-live="assertive"
      >
        <Flag className="mx-auto h-10 w-10 text-destructive/50" aria-hidden="true" />
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
        {/* WebSocket Connection Notice */}
        <ConnectionNotice isConnected={isConnected} />

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

        {/* Predefined Flags (ADR-133) */}
        <Card className="bg-muted/30">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-semibold">Predefined Flags — ADR-133</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
              role="note"
              aria-label="Scoring engine not implemented"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Scoring engine: Not implemented.</strong> The
                scoring-related flags below (
                <code className="font-mono">auto_stop_threshold</code>,{" "}
                <code className="font-mono">alert_on_critical_score</code>,{" "}
                <code className="font-mono">request_sampling_rate</code>) are
                stored and editable, but no scoring engine evaluates them yet.
                They have no runtime effect until the engine ships.
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PREDEFINED_FLAGS.map((pf) => (
                <div
                  key={pf.key}
                  className={cn(
                    "rounded-md border bg-background p-3",
                    SCORING_FLAG_KEYS.has(pf.key) && "border-dashed border-amber-500/50",
                  )}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono font-semibold">
                      {pf.key}
                    </code>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">
                      {pf.type}
                    </Badge>
                    {SCORING_FLAG_KEYS.has(pf.key) && (
                      <Badge
                        variant="outline"
                        className="text-[10px] h-4 px-1 border-amber-500/40 text-amber-600 dark:text-amber-400"
                        title="This flag is not evaluated by any scoring engine"
                      >
                        no engine
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {pf.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

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
                <div className="overflow-x-auto rounded-md border">
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
                            {typeof flag.value === "boolean" ? (
                              <Switch
                                checked={flag.value}
                                onCheckedChange={() => handleToggleFlag(flag)}
                                aria-label={`Toggle value of ${flag.key}`}
                              />
                            ) : (
                              <span className="font-mono text-xs text-muted-foreground">
                                {String(flag.value)}
                              </span>
                            )}
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
              aria-label={`Edit flag ${flag.key}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setDeletingFlag(flag);
              }}
              aria-label={`Delete flag ${flag.key}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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

// ─── Connection Notice ───────────────────────────────────────────

function ConnectionNotice({ isConnected }: { isConnected: boolean }) {
  if (isConnected) {
    return (
      <div
        className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-4 py-2 text-sm text-emerald-600 dark:text-emerald-400"
        role="status"
        aria-live="polite"
      >
        <Wifi className="h-3.5 w-3.5" />
        <span>Live — WebSocket connected</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 rounded-md bg-amber-500/10 px-4 py-2 text-sm text-amber-600 dark:text-amber-400"
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>WS disconnected, using polling fallback</span>
    </div>
  );
}
