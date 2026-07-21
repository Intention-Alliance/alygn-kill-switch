"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { SecretsList } from "./secrets-list";
import { StatusBar } from "./status-bar";
import { AuditLogPanel } from "./audit-log-panel";
import { LockoutBanner } from "./lockout-banner";
import { RotateConfirmDialog } from "./rotate-confirm-dialog";
import { CommandPalette } from "./command-palette";
import { EmptyState } from "./empty-state";
import { LoaderHealthBadge } from "./secrets-loader-badge";
import { HelpOverlay } from "./help-overlay";
import type { SecretInfo, SecretsPageData, SecretsAuditEvent } from "@/types/secrets";

interface SecretsPageClientProps {
  initial: SecretsPageData;
}

export function SecretsPageClient({ initial }: SecretsPageClientProps) {
  const [secrets, setSecrets] = useState<SecretInfo[]>(initial.secrets);
  const [health, setHealth] = useState(initial.health);
  const [audit, setAudit] = useState<SecretsAuditEvent[]>(initial.audit);
  const [rotatingName, setRotatingName] = useState<string | null>(null);
  const [rotateTarget, setRotateTarget] = useState<SecretInfo | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [auditFilter, setAuditFilter] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [dismissedLockouts, setDismissedLockouts] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const lockedNames = useMemo(() => {
    const locked = new Set<string>();
    for (const secret of secrets) {
      if (secret.state === "locked") locked.add(secret.name);
    }
    return locked;
  }, [secrets]);

  const handleRotate = useCallback((secret: SecretInfo) => {
    setRotateTarget(secret);
  }, []);

  const confirmRotate = useCallback(async () => {
    if (!rotateTarget) return;
    const name = rotateTarget.name;
    setRotatingName(name);
    setRotateTarget(null);
    try {
      const res = await fetch(`/api/admin/secrets/${encodeURIComponent(name)}/rotate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error((await res.text()) || "Rotation failed");
      const result = await res.json();
      setSecrets((prev) =>
        prev.map((s) =>
          s.name === name
            ? {
                ...s,
                lastRotatedAt: result.rotatedAt,
                previewSuffix: result.previewSuffix ?? rollPreviewSuffix(),
              }
            : s,
        ),
      );
      setAudit((prev) => [
        {
          id: `evt-${Date.now()}`,
          at: new Date().toISOString(),
          event: "rotate",
          name,
          actor: "admin",
          result: "ok",
          meta: { filesWritten: result.filesWritten, appsReloaded: result.appsReloaded },
        },
        ...prev,
      ]);
      toast.success(`${name} rotated`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Rotation failed";
      toast.error(message);
    } finally {
      setRotatingName(null);
    }
  }, [rotateTarget]);

  const dismissLockout = useCallback((name: string) => {
    setDismissedLockouts((prev) => new Set([...prev, name]));
  }, []);

  const viewHistory = useCallback((id: string) => {
    setAuditFilter("");
    setHighlightedId(id);
    const el = document.getElementById("audit-log");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((open) => !open);
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!highlightedId) return;
    const t = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(t);
  }, [highlightedId]);

  useEffect(() => {
    setSecrets(initial.secrets);
    setHealth(initial.health);
    setAudit(initial.audit);
  }, [initial]);

  const lockout = health.lockouts > 0 ? secrets.find((s) => s.state === "locked") : undefined;

  return (
    <div className="space-y-4">
      {lockout && !dismissedLockouts.has(lockout.name) && (
        <LockoutBanner
          name={lockout.name}
          count={health.lockouts}
          windowSec={300}
          autoUnlockAt={new Date(Date.now() + 5 * 60 * 1000).toISOString()}
          last401Source="nginx 11435"
          dismissed={false}
          onDismiss={() => dismissLockout(lockout.name)}
          onViewHistory={() => {
            const evt = audit.find((e) => e.event === "401-storm" || e.event === "401");
            if (evt) viewHistory(evt.id);
          }}
        />
      )}

      {secrets.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <SecretsList
            secrets={secrets}
            rotatingName={rotatingName}
            lockedNames={lockedNames}
            onRotate={handleRotate}
            isLoading={isLoading}
          />

          <StatusBar health={health} />

          <AuditLogPanel
            events={audit}
            filter={auditFilter}
            onFilterChange={setAuditFilter}
            highlightedId={highlightedId}
          />
        </>
      )}

      <RotateConfirmDialog
        secret={rotateTarget}
        open={!!rotateTarget}
        onOpenChange={(open) => {
          if (!open) setRotateTarget(null);
        }}
        onConfirm={confirmRotate}
        isPending={!!rotatingName}
      />

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        secrets={secrets}
        onRotate={handleRotate}
      />

      <HelpOverlay open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  );
}

function rollPreviewSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
