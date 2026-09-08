import { Suspense } from "react";
import DashboardTabs from "./dashboard-tabs";
import { BRAND_FULL_NAME } from "@/lib/branding";

export const metadata = {
  title: `Dashboard | ${BRAND_FULL_NAME}`,
};

/**
 * Root `/` route — lives INSIDE the `(dashboard)` route group so it inherits
 * the AuthGuard + sidebar layout. Renders the merged 2-step dashboard UI
 * (Overview / Kill Switch / Logs tabs) instead of a standalone page.
 *
 * The dashboard layout (`(dashboard)/layout.tsx`) special-cases `pathname ===
 * "/"` to render this full-screen (no max-w-6xl padding) with the sidebar.
 */
export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
        </div>
      }
    >
      <DashboardTabs initialTab="overview" />
    </Suspense>
  );
}
