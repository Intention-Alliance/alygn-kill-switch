"use client";

/**
 * FIDO2 Admin Screen (ADR-143) — /admin/security/fido2
 *
 * Manages the current user's WebAuthn security keys:
 *   1. List registered keys (GET /api/auth/webauthn/credentials)
 *   2. Register a new key (register/begin → startRegistration → register/finish)
 *   3. Test a key (assert/begin → startAuthentication → assert/finish)
 *   4. Rename / revoke a key (PATCH / DELETE /credentials/:id)
 *
 * All calls go through the Next.js rewrite /api/auth/:path* → /v1/auth/:path*,
 * so the client never sees the internal backend URL. The page is inside the
 * (dashboard) route group, so it inherits AuthGuard + sidebar.
 */

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Fingerprint, Plus, Shield, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Fido2KeysList } from "@/components/security/fido2-keys-list";
import { Fido2RegisterDialog } from "@/components/security/fido2-register-dialog";
import { Fido2TestDialog } from "@/components/security/fido2-test-dialog";
import { Fido2RevokeDialog } from "@/components/security/fido2-revoke-dialog";
import { Fido2RenameDialog } from "@/components/security/fido2-rename-dialog";
import type {
  Fido2Credential,
  Fido2CredentialsResponse,
} from "@/types/fido2";

export default function Fido2Page() {
  const [credentials, setCredentials] = useState<Fido2Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [testCredential, setTestCredential] = useState<Fido2Credential | null>(null);
  const [revokeCredential, setRevokeCredential] = useState<Fido2Credential | null>(null);
  const [renameCredential, setRenameCredential] = useState<Fido2Credential | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<Fido2CredentialsResponse>(
        "/api/auth/webauthn/credentials",
      );
      setCredentials(data.credentials);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load keys";
      toast.error("Failed to load security keys", { description: message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-primary" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-tight">
            FIDO2 Security Keys
          </h1>
          <Badge variant="secondary">{credentials.length} keys</Badge>
        </div>
        <Button onClick={() => setRegisterOpen(true)} data-testid="register-key">
          <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
          Register New Key
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Manage hardware security keys for admin sign-in. Keys are verified
        end-to-end via the WebAuthn ceremony before they are stored.
      </p>

      {/* Registered keys */}
      <Card className="rounded-md border">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-sm font-semibold">
              Registered Keys
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading keys…
            </div>
          ) : (
            <Fido2KeysList
              credentials={credentials}
              onTest={setTestCredential}
              onRename={setRenameCredential}
              onRevoke={setRevokeCredential}
            />
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <Fido2RegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        onRegistered={refresh}
      />
      <Fido2TestDialog
        credential={testCredential}
        onOpenChange={(open) => !open && setTestCredential(null)}
      />
      <Fido2RevokeDialog
        credential={revokeCredential}
        onOpenChange={(open) => !open && setRevokeCredential(null)}
        onRevoked={refresh}
      />
      <Fido2RenameDialog
        credential={renameCredential}
        onOpenChange={(open) => !open && setRenameCredential(null)}
        onRenamed={refresh}
      />
    </div>
  );
}
