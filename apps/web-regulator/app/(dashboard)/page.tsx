import { Suspense } from "react";
import DashboardTabs from "./dashboard-tabs";

// Server Component boundary: reads the `?tab=` search param so deep links
// like `/?tab=kill-switch` and `/?tab=logs` resolve to the right tab on
// first paint (no client-side redirect flash). Invalid/absent values fall
// back to `overview`.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab = tab === "kill-switch" || tab === "logs" ? tab : "overview";

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
        </div>
      }
    >
      <DashboardTabs initialTab={initialTab} />
    </Suspense>
  );
}
