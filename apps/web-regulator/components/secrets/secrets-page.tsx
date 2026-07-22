"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { SecretsList } from "./secrets-list";
import { StatusBar } from "./status-bar";
import { AuditLogPanel } from "./audit-log-panel";
import { LockoutBanner } from "./lockout-banner";
import { RotateConfirmDialog } from "./rotate-confirm-dialog";
import { CommandPalette } from "./command-palette";
import { EmptyState } from "./empty-state";
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
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(-1);
  const rotateButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

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

  const focusRotateButton = useCallback((index: number) => {
    const secret = secrets[index];
    if (!secret) return;
    const btn = rotateButtonRefs.current.get(secret.name);
    if (btn) {
      btn.focus();
      setFocusedRowIndex(index);
    }
  }, [secrets]);

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
        return;
      }

      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isEditable = (e.target as HTMLElement)?.isContentEditable;
      const typing = tag === "input" || tag === "textarea" || isEditable;
      if (secrets.length === 0 || typing) return;

      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const nextIndex =
          e.key === "j"
            ? (focusedRowIndex + 1) % secrets.length
            : (focusedRowIndex - 1 + secrets.length) % secrets.length;
        focusRotateButton(nextIndex);
        return;
      }

      if (e.key === "r") {
        const active = document.activeElement;
        const matchingSecret = secrets.find(
          (s) => rotateButtonRefs.current.get(s.name) === active,
        );
        if (matchingSecret && matchingSecret.state !== "locked") {
          e.preventDefault();
          handleRotate(matchingSecret);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);

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
            rotateButtonRef={(name, el) => {
              if (el) rotateButtonRefs.current.set(name, el);
              else rotateButtonRefs.current.delete(name);
            }}
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
