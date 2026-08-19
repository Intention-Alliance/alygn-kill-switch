"use client";

/**
 * Security Key Sign-In Button — "Sign in with security key".
 *
 * Drives the WebAuthn login assertion ceremony (ADR-143 follow-up):
 *   1. POST /api/auth/webauthn/login/begin → { options, challengeId }
 *   2. startAuthentication(options) → user touches the YubiKey
 *   3. POST /api/auth/webauthn/login/finish { challengeId, response }
 *      → on success the backend sets the Better-Auth session cookie
 *   4. Redirect to the post-login route
 *
 * This runs BEFORE the user has a session, so it does not require a
 * session cookie (the backend login/begin + login/finish endpoints are
 * cookie-free by design).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Fingerprint, Loader2 } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { apiPost } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type {
  Fido2LoginBeginResponse,
  Fido2LoginFinishResponse,
} from "@/types/fido2";

interface SecurityKeySignInButtonProps {
  /** Post-login redirect target. Defaults to "/kill-switch". */
  redirectTo?: string;
}

export function SecurityKeySignInButton({
  redirectTo = "/kill-switch",
}: SecurityKeySignInButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignIn() {
    if (busy) return;
    setBusy(true);
    try {
      // 1. Begin the login assertion (no session cookie required)
      const begin = await apiPost<Fido2LoginBeginResponse>(
        "/api/auth/webauthn/login/begin",
      );

      // 2. Browser WebAuthn ceremony — user touches the key
      const response = await startAuthentication({
        optionsJSON: begin.options,
      });

      // 3. Finish — backend verifies and mints the session cookie
      const result = await apiPost<Fido2LoginFinishResponse>(
        "/api/auth/webauthn/login/finish",
        { challengeId: begin.challengeId, response },
      );

      if (!result.verified) {
        throw new Error("Sign-in was not verified by the server");
      }

      toast.success("Signed in with security key", {
        description: `Welcome back, ${result.name || result.email}.`,
      });
      router.push(redirectTo);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Sign-in failed";
      toast.error("Touch your security key again or use password", {
        description: message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      onClick={handleSignIn}
      disabled={busy}
    >
      {busy ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Touch your security key…
        </>
      ) : (
        <>
          <Fingerprint className="mr-2 h-4 w-4" aria-hidden="true" />
          Sign in with security key
        </>
      )}
    </Button>
  );
}
