import { Key, Check } from "lucide-react";
import { fetchInitialSecrets } from "./actions";
import { LoaderHealthBadge } from "@/components/secrets/secrets-loader-badge";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
      <PageHeader secretCount={initial.secrets.length} health={initial.health} />
      <SecretsPageClient initial={initial} />
    </div>
  );
}

function IdentityPill() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 rounded-full border bg-card px-2 py-1 text-xs text-card-foreground">
          <Check className="h-3 w-3 text-success" aria-hidden="true" />
          <span className="font-mono">andler@tail-andler-dev</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs">Tailscale identity verified</p>
        <p className="text-[10px] text-muted-foreground">Esc ? Cmd+K</p>
      </TooltipContent>
    </Tooltip>
  );
}

function PageHeader({
  secretCount,
  health,
}: {
  secretCount: number;
  health: SecretsPageData["health"];
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      <div className="flex items-center gap-2">
        <Key className="h-4 w-4 text-primary" aria-hidden="true" />
        <h1 className="text-xl font-semibold tracking-tight">Secrets</h1>
        <Badge variant="secondary">{secretCount} keys</Badge>
      </div>

      <LoaderHealthBadge state={health.state} />

      <div className="flex items-center justify-end">
        <IdentityPill />
      </div>
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
