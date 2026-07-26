"use client";

/**
 * Webhook API Keys page client (Card 0e2f9fec).
 *
 * Features:
 *  - List keys with prefix, name, scopes, last_used, status
 *  - "Generate new key" → modal → one-time copy with confirm button
 *  - "Rotate" → confirm → returns new key, old key revoked
 *  - "Revoke" → confirm → soft delete
 *  - Click row → audit log side panel
 *
 * The plaintext key is shown ONCE (in the copy dialog after create/rotate).
 * Never logged, never persisted client-side.
 *
 * @author Keridz ⚙️ (be-coder)
 */

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Key,
  Plus,
  RotateCw,
  Trash2,
  Copy,
  Check,
  Clock,
  History,
  ShieldOff,
  Activity,
} from "lucide-react";
import {
  createApiKey,
  rotateApiKey,
  revokeApiKey,
  fetchApiKeyAudit,
} from "@/app/(dashboard)/admin/api-keys/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ApiKeyInfo,
  ApiKeyAuditEvent,
  ApiKeysPageData,
  CreateApiKeyResult,
} from "@/types/api-keys";

interface Props {
  initial: ApiKeysPageData;
}

const ALL_SCOPES = ["live-chat", "webhook-request", "blog-pipeline", "admin"] as const;

function statusOf(k: ApiKeyInfo): "active" | "revoked" | "expired" {
  if (k.revokedAt) return "revoked";
  if (k.expiresAt && new Date(k.expiresAt) < new Date()) return "expired";
  return "active";
}

function statusBadge(s: "active" | "revoked" | "expired") {
  if (s === "active") return <Badge variant="default">active</Badge>;
  if (s === "revoked") return <Badge variant="destructive">revoked</Badge>;
  return <Badge variant="secondary">expired</Badge>;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

export function ApiKeysPageClient({ initial }: Props) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>(initial.keys)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [revealedKey, setRevealedKey] = useState<CreateApiKeyResult | null>(null)
  const [confirmSaved, setConfirmSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [auditKey, setAuditKey] = useState<ApiKeyInfo | null>(null)
  const [auditEntries, setAuditEntries] = useState<ApiKeyAuditEvent[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleCreated(result: CreateApiKeyResult) {
    setRevealedKey(result)
    setConfirmSaved(false)
    setCopied(false)
    setGenerateOpen(false)
    // Refresh the list (without the plaintext key)
    refresh()
  }

  function refresh() {
    startTransition(async () => {
      try {
        const { fetchApiKeys: f } = await import("@/app/(dashboard)/admin/api-keys/actions")
        const next = await f()
        setKeys(next.keys)
      } catch (e) {
        toast.error("Failed to refresh keys", { description: String(e) })
      }
    })
  }

  async function onCreate(input: { name: string; scopes: string[] }) {
    try {
      const result = await createApiKey(input)
      handleCreated(result)
      toast.success("Key generated", {
        description: `Copy the key now — it will not be shown again.`,
      })
    } catch (e) {
      toast.error("Failed to create key", { description: String(e) })
    }
  }

  async function onRotate(id: string) {
    if (!confirm("Rotate this key? The current key will be revoked immediately.")) return
    try {
      const result = await rotateApiKey(id)
      setRevealedKey(result)
      setConfirmSaved(false)
      setCopied(false)
      refresh()
      toast.success("Key rotated", {
        description: `New key generated. Old key (${result.revokedKeyId}) revoked.`,
      })
    } catch (e) {
      toast.error("Failed to rotate key", { description: String(e) })
    }
  }

  async function onRevoke(id: string) {
    if (!confirm("Revoke this key? This cannot be undone — any active caller will get 401.")) return
    try {
      await revokeApiKey(id)
      refresh()
      toast.success("Key revoked")
    } catch (e) {
      toast.error("Failed to revoke key", { description: String(e) })
    }
  }

  async function onCopyKey() {
    if (!revealedKey) return
    try {
      await navigator.clipboard.writeText(revealedKey.key)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Clipboard write failed — please copy manually")
    }
  }

  async function onOpenAudit(key: ApiKeyInfo) {
    setAuditKey(key)
    setAuditEntries([])
    setAuditLoading(true)
    try {
      const entries = await fetchApiKeyAudit(key.id)
      setAuditEntries(entries)
    } catch (e) {
      toast.error("Failed to load audit", { description: String(e) })
    } finally {
      setAuditLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          M2M keys for the openclaw-webhook gateway. The kill-switch-api is the single source
          of truth — Vercel and the openclaw-webhook env both defer to this list.
        </p>
        <Button onClick={() => setGenerateOpen(true)} data-testid="generate-key">
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Generate new key
        </Button>
      </div>

      <Card className="rounded-md border">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold">Active keys</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {keys.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {keys.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No keys yet. Click <strong>Generate new key</strong> above to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => {
                  const status = statusOf(k)
                  return (
                    <TableRow key={k.id} className="cursor-pointer" onClick={() => onOpenAudit(k)}>
                      <TableCell className="font-mono text-xs">
                        {k.keyPrefix}…
                      </TableCell>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(k.lastUsedAt)}
                      </TableCell>
                      <TableCell>{statusBadge(status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          {status === "active" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onRotate(k.id)}
                              aria-label="Rotate key"
                            >
                              <RotateCw className="h-3 w-3" aria-hidden="true" />
                            </Button>
                          )}
                          {status === "active" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onRevoke(k.id)}
                              aria-label="Revoke key"
                            >
                              <ShieldOff className="h-3 w-3 text-destructive" aria-hidden="true" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Generate modal */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate new key</DialogTitle>
            <DialogDescription>
              The key will be shown <strong>once</strong>. Store it in your password manager
              (1Password, etc.) — you will not be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <GenerateForm
            onCancel={() => setGenerateOpen(false)}
            onSubmit={onCreate}
          />
        </DialogContent>
      </Dialog>

      {/* One-time copy modal (after create or rotate) */}
      <Dialog open={!!revealedKey} onOpenChange={(open) => !open && setRevealedKey(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              <Key className="inline h-4 w-4 mr-1 text-primary" aria-hidden="true" />
              Your new key
            </DialogTitle>
            <DialogDescription>
              Copy this key and store it securely. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          {revealedKey && (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 p-3">
                <code
                  className="block break-all font-mono text-xs"
                  data-testid="revealed-key"
                >
                  {revealedKey.key}
                </code>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={onCopyKey} variant="outline" size="sm">
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 mr-1" aria-hidden="true" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 mr-1" aria-hidden="true" />
                      Copy to clipboard
                    </>
                  )}
                </Button>
                {revealedKey.revokedKeyId && (
                  <span className="text-xs text-muted-foreground">
                    Old key ({revealedKey.revokedKeyId}) was revoked.
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmSaved}
                  onChange={(e) => setConfirmSaved(e.target.checked)}
                  data-testid="confirm-saved"
                />
                I've saved this key in my password manager
              </label>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => setRevealedKey(null)}
              disabled={!confirmSaved}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit side panel */}
      <Sheet open={!!auditKey} onOpenChange={(open) => !open && setAuditKey(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              <History className="inline h-4 w-4 mr-1" aria-hidden="true" />
              Audit log
            </SheetTitle>
            <SheetDescription>
              {auditKey && (
                <>
                  {auditKey.name} · <code className="text-xs">{auditKey.keyPrefix}…</code>
                </>
              )}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {auditLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : auditEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit entries.</p>
            ) : (
              <ul className="space-y-2">
                {auditEntries.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-md border p-3 text-sm space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px]">{e.action}</Badge>
                      <span className="text-xs text-muted-foreground">
                        <Clock className="inline h-3 w-3 mr-1" aria-hidden="true" />
                        {fmtDate(e.at)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      by <span className="font-mono">{e.actor}</span>
                    </div>
                    {e.meta && (
                      <pre className="text-[10px] font-mono bg-muted/30 p-2 rounded overflow-x-auto">
                        {JSON.stringify(e.meta, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─── Generate form (inline) ─────────────────────────────────────

function GenerateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: { name: string; scopes: string[] }) => void | Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState<string[]>(["live-chat"])
  const [busy, setBusy] = useState(false)

  function toggleScope(s: string) {
    setScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (scopes.length === 0) return
    setBusy(true)
    try {
      await onSubmit({ name: name.trim(), scopes })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="key-name">Name</Label>
        <Input
          id="key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. andler-landing-vercel"
          required
        />
      </div>
      <div className="space-y-1">
        <Label>Scopes</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_SCOPES.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={() => toggleScope(s)}
              />
              <code className="text-xs">{s}</code>
            </label>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !name.trim() || scopes.length === 0}>
          {busy ? "Generating…" : "Generate"}
        </Button>
      </DialogFooter>
    </form>
  )
}
