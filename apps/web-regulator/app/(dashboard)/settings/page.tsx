"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Shield, Loader2, Lock, UserCog } from "lucide-react";
import { ErrorBoundary, SectionErrorBoundary } from "@/components/error-boundary";
import { useSettingsSync } from "@/hooks/use-settings-sync";
import { useAuth } from "@/lib/auth-context";
import {
  canWriteSettings,
  canManageRbac,
  ROLE_LABELS,
  roleDescription,
} from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiPost, apiPut } from "@/lib/api-client";
import { toast } from "sonner";
import {
  parseSettings,
  serializeSettings,
  type AppSettings,
  type RawSettings,
} from "@/types/shared";

interface SettingsResponse {
  settings: RawSettings;
  updatedAt: string;
}

/** Map of camelCase frontend keys to snake_case API keys */
const KEY_MAP: Record<keyof AppSettings, string> = {
  autoPollInterval: "auto_poll_interval",
  enableNotifications: "enable_notifications",
  auditLogRetentionDays: "audit_log_retention_days",
  sessionTimeoutMinutes: "session_timeout_minutes",
  ipAllowlistEnabled: "ip_allowlist_enabled",
  rateLimitPerMinute: "rate_limit_per_minute",
};

/** Reverse map for API responses */
function toRawSettings(appSettings: Partial<AppSettings>): RawSettings {
  const result: RawSettings = {};
  if (appSettings.autoPollInterval !== undefined) {
    result.auto_poll_interval = String(appSettings.autoPollInterval);
  }
  if (appSettings.enableNotifications !== undefined) {
    result.enable_notifications = String(appSettings.enableNotifications);
  }
  if (appSettings.auditLogRetentionDays !== undefined) {
    result.audit_log_retention_days = String(
      appSettings.auditLogRetentionDays,
    );
  }
  if (appSettings.sessionTimeoutMinutes !== undefined) {
    result.session_timeout_minutes = String(
      appSettings.sessionTimeoutMinutes,
    );
  }
  if (appSettings.ipAllowlistEnabled !== undefined) {
    result.ip_allowlist_enabled = String(appSettings.ipAllowlistEnabled);
  }
  if (appSettings.rateLimitPerMinute !== undefined) {
    result.rate_limit_per_minute = String(appSettings.rateLimitPerMinute);
  }
  return result;
}

/** Inline error indicator shown when a setting failed to save */
function SettingErrorBadge({ apiKey, failedKeys }: { apiKey: string; failedKeys: Set<string> }) {
  if (!failedKeys.has(apiKey)) return null;
  return (
    <span className="ml-2 inline-flex items-center rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
      Save failed
    </span>
  );
}

const DEFAULT_SETTINGS: AppSettings = {
  autoPollInterval: 5000,
  enableNotifications: true,
  auditLogRetentionDays: 30,
  sessionTimeoutMinutes: 60,
  ipAllowlistEnabled: false,
  rateLimitPerMinute: 100,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] =
    useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ─── RBAC (ADR-141) ────────────────────────────────────────
  // The backend enforces admin-only writes (403 otherwise). Mirror that
  // here so non-admin users see read-only controls instead of failing saves.
  const canWrite = canWriteSettings(user?.role);
  const canManage = canManageRbac(user?.role);

  // ─── Fetch settings on mount ──────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiGet<SettingsResponse>("/api/settings");
      const parsed = parseSettings(data.settings);
      setSettings(parsed);
    } catch (err) {
      // If settings API is not yet available, use defaults
      // eslint-disable-next-line no-console
      console.warn(
        "[settings] API not available, using defaults:",
        err instanceof Error ? err.message : "",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // ─── Cross-tab sync ───────────────────────────────────────

  const { broadcastSetting } = useSettingsSync((key, value) => {
    if (value === null) return;

    // Map snake_case sync key back to AppSettings field
    const camelKey = (Object.entries(KEY_MAP) as [keyof AppSettings, string][]).find(
      ([, v]) => v === key,
    )?.[0];

    if (!camelKey) return;

    setSettings((prev) => {
      const parsed = parseSettings({ [key]: value });
      return { ...prev, ...parsed };
    });
  });

  // ─── Update a single setting ──────────────────────────────────

  const updateSetting = useCallback(
    async <K extends keyof AppSettings>(
      key: K,
      value: AppSettings[K],
    ) => {
      // RBAC guard (ADR-141): non-admin users cannot write settings.
      if (!canWrite) {
        toast.error("Settings are read-only for your role");
        fetchSettings();
        return;
      }

      setSettings((prev) => ({ ...prev, [key]: value }));

      const apiKey = KEY_MAP[key];
      const stringValue = String(value);

      try {
        await apiPut(`/api/settings/${apiKey}`, {
          value: stringValue,
        });
        // Broadcast to other tabs
        broadcastSetting(apiKey, stringValue);
      } catch (err) {
        // Detect 403 — insufficient permissions
        if (err instanceof Error && err.message.includes("403")) {
          toast.error("Save failed — ensure you have admin privileges");
        } else {
          toast.error(
            err instanceof Error
              ? err.message
              : `Failed to save "${apiKey}"`,
          );
        }
        // Revert on failure
        fetchSettings();
      }
    },
    [fetchSettings, broadcastSetting, canWrite],
  );

  // ─── Batch save all settings ──────────────────────────────────

  // Tracks which settings failed to save for inline error display
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set());

  async function handleSaveAll() {
    if (!canWrite) {
      toast.error("Settings are read-only for your role");
      return;
    }
    setIsSaving(true);
    setFailedKeys(new Set());

    // Save each setting individually for partial-failure tolerance
    const entries = Object.entries(KEY_MAP) as [keyof AppSettings, string][];
    const results = await Promise.allSettled(
      entries.map(async ([camelKey, apiKey]) => {
        const stringValue = String(settings[camelKey]);
        await apiPut(`/api/settings/${apiKey}`, {
          value: stringValue,
        });
        broadcastSetting(apiKey, stringValue);
        return camelKey;
      }),
    );

    const failures: string[] = [];
    const failedSet = new Set<string>();

    results.forEach((result) => {
      if (result.status === "rejected") {
        const err = result.reason as Error | undefined;
        const msg = err?.message ?? "";
        if (msg.includes("403")) {
          failures.push("Requires admin privileges");
        } else {
          failures.push(msg || "Unknown error");
        }
      } else if (result.status === "fulfilled") {
        failedSet.delete(
          KEY_MAP[result.value as keyof AppSettings] ?? "",
        );
      }
    });

    // Identify which keys failed for inline indicators
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        failedSet.add(entries[i][1]);
      }
    });
    setFailedKeys(failedSet);

    if (failures.length === 0) {
      toast.success("All settings saved");
    } else if (failures.length === results.length) {
      toast.error("All settings failed to save — check your permissions");
    } else {
      toast.warning(
        `${results.length - failures.length} of ${results.length} settings saved — ${failures.length} failed`,
      );
    }

    setIsSaving(false);
  }

  // ─── Loading State ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">
              Settings
            </h1>
            {user?.role && (
              <Badge
                variant={canWrite ? "default" : "secondary"}
                className="ml-1 capitalize"
                title={`Role: ${ROLE_LABELS[user.role]}`}
              >
                {canWrite ? (
                  <UserCog className="mr-1 h-3 w-3" aria-hidden="true" />
                ) : (
                  <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
                )}
                {ROLE_LABELS[user.role]}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            System configuration and preferences
          </p>
        </div>

        <Separator />

        {/* RBAC Notice (ADR-141) */}
        <SectionErrorBoundary title="Access Control">
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  Role-Based Access Control
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {canWrite ? (
                    <UserCog className="h-5 w-5 text-primary mt-0.5" aria-hidden="true" />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground mt-0.5" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {user?.role
                        ? `Signed in as ${ROLE_LABELS[user.role]}`
                        : "Signed in as unknown role"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {user?.role
                        ? roleDescription(user.role)
                        : "Unable to determine your role."}
                    </p>
                  </div>
                </div>
                {!canWrite && (
                  <Badge variant="secondary" className="shrink-0">
                    <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
                    Read-only
                  </Badge>
                )}
              </div>
              {!canWrite && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Settings writes require the <strong>admin</strong> role. You
                  can view current values but changes are disabled. Contact an
                  admin to modify configuration.
                </p>
              )}
              {canManage && (
                <p className="mt-3 text-xs text-muted-foreground">
                  As an admin you can modify all settings. Role management is
                  handled by the backend (Better-Auth).
                </p>
              )}
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        {/* General Settings */}
        <SectionErrorBoundary title="General Settings">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">General</CardTitle>
              <CardDescription>
                Basic system configuration options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label
                    htmlFor="auto-poll-interval"
                    className="font-medium"
                  >
                    Auto-poll Interval
                    <SettingErrorBadge apiKey="auto_poll_interval" failedKeys={failedKeys} />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Status refresh interval in milliseconds (1000–60000)
                  </p>
                </div>
                <Input
                  id="auto-poll-interval"
                  type="number"
                  className="w-24"
                  min={1000}
                  max={60000}
                  step={1000}
                  disabled={!canWrite}
                  value={settings.autoPollInterval}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 1000 && n <= 60000) {
                      updateSetting("autoPollInterval", n);
                    } else if (e.target.value === "") {
                      setSettings((prev) => ({
                        ...prev,
                        autoPollInterval: 1000,
                      }));
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label
                    htmlFor="enable-notifications"
                    className="font-medium"
                  >
                    Enable Notifications
                    <SettingErrorBadge apiKey="enable_notifications" failedKeys={failedKeys} />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Receive desktop notifications for state changes
                  </p>
                </div>
                <Switch
                  id="enable-notifications"
                  checked={settings.enableNotifications}
                  disabled={!canWrite}
                  onCheckedChange={(checked) =>
                    updateSetting("enableNotifications", checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label
                    htmlFor="audit-log-retention"
                    className="font-medium"
                  >
                    Audit Log Retention
                    <SettingErrorBadge apiKey="audit_log_retention_days" failedKeys={failedKeys} />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Days to keep activation history records (1–365)
                  </p>
                </div>
                <Input
                  id="audit-log-retention"
                  type="number"
                  className="w-24"
                  min={1}
                  max={365}
                  disabled={!canWrite}
                  value={settings.auditLogRetentionDays}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 1 && n <= 365) {
                      updateSetting("auditLogRetentionDays", n);
                    } else if (e.target.value === "") {
                      setSettings((prev) => ({
                        ...prev,
                        auditLogRetentionDays: 30,
                      }));
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        {/* Security Settings */}
        <SectionErrorBoundary title="Security">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Security</CardTitle>
              <CardDescription>
                Authentication and access control settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label
                    htmlFor="session-timeout"
                    className="font-medium"
                  >
                    Session Timeout
                    <SettingErrorBadge apiKey="session_timeout_minutes" failedKeys={failedKeys} />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically log out after inactivity in minutes
                    (5–480)
                  </p>
                </div>
                <Input
                  id="session-timeout"
                  type="number"
                  className="w-24"
                  min={5}
                  max={480}
                  disabled={!canWrite}
                  value={settings.sessionTimeoutMinutes}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 5 && n <= 480) {
                      updateSetting("sessionTimeoutMinutes", n);
                    } else if (e.target.value === "") {
                      setSettings((prev) => ({
                        ...prev,
                        sessionTimeoutMinutes: 60,
                      }));
                    }
                  }}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label
                    htmlFor="ip-allowlist"
                    className="font-medium"
                  >
                    IP Allowlist
                    <SettingErrorBadge apiKey="ip_allowlist_enabled" failedKeys={failedKeys} />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Restrict dashboard access to specific IPs
                  </p>
                </div>
                <Switch
                  id="ip-allowlist"
                  checked={settings.ipAllowlistEnabled}
                  disabled={!canWrite}
                  onCheckedChange={(checked) =>
                    updateSetting("ipAllowlistEnabled", checked)
                  }
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label
                    htmlFor="rate-limit"
                    className="font-medium"
                  >
                    Rate Limiting
                    <SettingErrorBadge apiKey="rate_limit_per_minute" failedKeys={failedKeys} />
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Limit API requests per minute (10–1000)
                  </p>
                </div>
                <Input
                  id="rate-limit"
                  type="number"
                  className="w-24"
                  min={10}
                  max={1000}
                  disabled={!canWrite}
                  value={settings.rateLimitPerMinute}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!isNaN(n) && n >= 10 && n <= 1000) {
                      updateSetting("rateLimitPerMinute", n);
                    } else if (e.target.value === "") {
                      setSettings((prev) => ({
                        ...prev,
                        rateLimitPerMinute: 100,
                      }));
                    }
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        {/* About */}
        <SectionErrorBoundary title="About">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">About</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">
                    ALYGN Regulator v2.0.0
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sovereign Compliance Infrastructure for AI
                    Safety. Backend: Bun + Elysia + Better-Auth +
                    SQLite. Frontend: Next.js 16 + shadcn/ui +
                    Tailwind CSS v4.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        {/* Save Button — batch save all */}
        <div className="flex justify-end">
          <Button
            onClick={handleSaveAll}
            disabled={isSaving || isLoading || !canWrite}
            title={!canWrite ? "Read-only for your role" : undefined}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </div>
      </div>
    </ErrorBoundary>
  );
}
