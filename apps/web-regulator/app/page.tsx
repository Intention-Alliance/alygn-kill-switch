"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Shield, Loader2 } from "lucide-react";

export default function RootPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [redirected, setRedirected] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      router.replace("/kill-switch");
    } else {
      router.replace("/login");
    }
    setRedirected(true);
  }, [isAuthenticated, isLoading, router]);

  // Show loading while checking auth
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center">
        <Shield className="mx-auto h-10 w-10 text-primary animate-pulse" />
        <p className="mt-4 text-sm text-muted-foreground">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying session…
            </span>
          ) : redirected ? (
            "Redirecting…"
          ) : (
            "Loading…"
          )}
        </p>
      </div>
    </div>
  );
}
