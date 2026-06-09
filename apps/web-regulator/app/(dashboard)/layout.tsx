"use client";

import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import { useAuth } from "@/lib/auth-context";
import {
  MachineSelectionProvider,
  useMachineSelection,
} from "@/lib/machine-selection-context";
import { useKillSwitchWebSocket } from "@/hooks/use-kill-switch-websocket";
import { apiPost } from "@/lib/api-client";
import { toast } from "sonner";
import type { KillSwitchState } from "@/types/shared";

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
  const isDashboard = pathname === "/";

  return (
    <MachineSelectionProvider>
      <DashboardLayoutInner isDashboard={isDashboard}>
        {children}
      </DashboardLayoutInner>
    </MachineSelectionProvider>
  );
}

function DashboardLayoutInner({
  children,
  isDashboard,
}: {
  children: ReactNode;
  isDashboard: boolean;
}) {
  const { selectedMachine, deselectMachine } = useMachineSelection();
  const { status } = useKillSwitchWebSocket();

  // Debounce guard for rapid sidebar Quick Actions double-fires (plan § 10).
  // 250ms is the v1.1 risk-mitigation value; a simple ref-captured timer is
  // sufficient (no need to pull in lodash for one use site).
  const killSwitchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleKillSwitchStateChange = useCallback(
    async (newState: KillSwitchState) => {
      // Drop the call if one is already in flight or just fired
      if (killSwitchDebounceRef.current !== null) return;

      killSwitchDebounceRef.current = setTimeout(() => {
        killSwitchDebounceRef.current = null;
      }, 250);

      try {
        const result = await apiPost<{
          current: KillSwitchState;
          previous: KillSwitchState;
          timestamp: number;
        }>("/api/kill-switch/chaos", {
          state: newState,
          reason: `Sidebar machine override: ${newState}`,
        });
        toast.success(`State changed to ${result.current}`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to change state";
        toast.error(message);
      }
    },
    [],
  );

  // Clean up pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (killSwitchDebounceRef.current !== null) {
        clearTimeout(killSwitchDebounceRef.current);
        killSwitchDebounceRef.current = null;
      }
    };
  }, []);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        {/* Desktop sidebar — always visible on md+ */}
        <AppSidebar
          selectedMachine={selectedMachine}
          onMachineDeselect={deselectMachine}
          currentKillSwitchState={status?.state ?? "ARMED"}
          onKillSwitchStateChange={handleKillSwitchStateChange}
        />

        {/* Mobile header with hamburger */}
        <MobileSidebar />

        <main className="flex-1 overflow-y-auto bg-background">
          {isDashboard ? (
            <ErrorBoundary>
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
                  </div>
                }
              >
                {children}
              </Suspense>
            </ErrorBoundary>
          ) : (
            <div className="mx-auto max-w-6xl p-4 pt-14 md:pt-4 lg:p-8">
              <ErrorBoundary>
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center py-20">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
                    </div>
                  }
                >
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
