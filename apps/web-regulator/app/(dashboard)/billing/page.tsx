"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Loader2, Settings2 } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import { canWriteSettings } from "@/lib/rbac";

/**
 * Billing Redirect — ADR-141 (Phase 5).
 *
 * Redirects the user to the configured billing provider (e.g. Stripe Billing
 * Portal). If no provider is configured (NEXT_PUBLIC_BILLING_URL unset), this
 * page renders a stub explaining that billing is not yet wired up.
 *
 * The redirect target is resolved from the environment at build/runtime:
 *   NEXT_PUBLIC_BILLING_URL — absolute URL of the billing portal.
 *
 * No server config lives in the repo (constraint); the URL is injected via
 * env at deploy time.
 */

function resolveBillingUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_BILLING_URL;
  if (!url) return null;
  try {
    // Validate it's an absolute http(s) URL to avoid open-redirect.
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export default function BillingPage() {
  const { user } = useAuth();
  const [billingUrl] = useState<string | null>(() => resolveBillingUrl());
  const [redirecting, setRedirecting] = useState(false);

  const isAdmin = canWriteSettings(user?.role);

  // Auto-redirect when a provider is configured.
  useEffect(() => {
    if (!billingUrl) return;
    setRedirecting(true);
    const t = setTimeout(() => {
      window.location.assign(billingUrl);
    }, 300);
    return () => clearTimeout(t);
  }, [billingUrl]);

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage your subscription and payment methods
          </p>
        </div>

        <Separator />

        {billingUrl ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                Redirecting to Billing Portal
                {redirecting && (
                  <Loader2
                    className="h-4 w-4 animate-spin text-primary"
                    aria-hidden="true"
                  />
                )}
              </CardTitle>
              <CardDescription>
                Taking you to the billing provider…
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                If you are not redirected automatically, click the button
                below.
              </p>
              <Button
                className="mt-4"
                onClick={() => window.location.assign(billingUrl)}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Billing Portal
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings2
                  className="h-5 w-5 text-muted-foreground"
                  aria-hidden="true"
                />
                Billing Not Configured
              </CardTitle>
              <CardDescription>
                No billing provider is configured for this deployment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <Badge variant="secondary" className="shrink-0">
                  Stub
                </Badge>
                <p className="text-sm text-muted-foreground">
                  This is a placeholder route (ADR-141). To enable billing,
                  set the{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                    NEXT_PUBLIC_BILLING_URL
                  </code>{" "}
                  environment variable to your billing portal URL (e.g. Stripe
                  Billing Portal). Once set, this page will redirect there
                  automatically.
                </p>
              </div>
              {isAdmin && (
                <p className="mt-4 text-xs text-muted-foreground">
                  As an admin you can configure the billing URL at deploy
                  time. No server config is stored in the repository.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ErrorBoundary>
  );
}
