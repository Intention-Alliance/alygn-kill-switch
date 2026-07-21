import { Key } from "lucide-react";
import { fetchInitialSecrets } from "./actions";
import { SecretsPageClient } from "@/components/secrets/secrets-page";
import type { SecretsPageData } from "@/types/secrets";

export const metadata = {
  title: "Secrets | AdminUI",
};

export default async function SecretsPage() {
  let initial: SecretsPageData;
  try {
    initial = await fetchInitialSecrets();
  } catch {
    initial = { secrets: [], health: fallbackHealth(), audit: [] };
  }

  return (
    <div className="space-y-4">
      <PageHeader secretCount={initial.secrets.length} />
      <SecretsPageClient initial={initial} />
    </div>
  );
}

function PageHeader({ secretCount }: { secretCount: number }) {
  return (
    <div className="flex items-center gap-2">
      <Key className="h-4 w-4 text-primary" aria-hidden="true" />
      <h1 className="text-xl font-semibold tracking-tight">Secrets</h1>
      <span className="sr-only">{secretCount} keys in scope</span>
    </div>
  );
}

function fallbackHealth() {
  return {
    state: "checking" as const,
    fsWatch: "ok" as const,
    sighup: "armed" as const,
    lastPollAt: new Date().toISOString(),
    nextPollInSeconds: 0,
    uptimeSeconds: 0,
    lockouts: 0,
  };
}
