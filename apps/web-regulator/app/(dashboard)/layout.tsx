"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAuth } from "@/lib/auth-context";

function AuthGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
          <p className="text-sm text-muted-foreground">Verifying session…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect — don't flash protected content
  }

  return <>{children}</>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Dashboard root page uses full-width (handles its own p-8).
  // All other (dashboard) pages get the legacy max-w-6xl wrapper.
  const isDashboard = pathname === "/";

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar — hidden on mobile */}
      <AppSidebar className="hidden md:flex" />

      {/* Mobile header with hamburger */}
      <MobileSidebar />

      <main className="flex-1 overflow-y-auto bg-background">
        {isDashboard ? (
          <ErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" /></div>}>
              {children}
            </Suspense>
          </ErrorBoundary>
        ) : (
          <div className="mx-auto max-w-6xl p-4 pt-14 md:pt-4 lg:p-8">
            <ErrorBoundary>
              <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" /></div>}>
                {children}
              </Suspense>
            </ErrorBoundary>
          </div>
        )}
      </main>
      </div>
    </AuthGuard>
  );
}
