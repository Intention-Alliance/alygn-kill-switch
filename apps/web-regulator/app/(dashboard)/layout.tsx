import type { ReactNode } from "react";
import { Suspense } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ErrorBoundary } from "@/components/error-boundary";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="mx-auto max-w-6xl p-6 lg:p-8">
          <ErrorBoundary>
            <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
              {children}
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
