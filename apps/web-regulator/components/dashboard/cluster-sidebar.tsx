"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Cluster, ClusterGPU } from "@/types/supabase.types";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Cpu,
  MapPin,
  Server,
} from "lucide-react";

interface ClusterSidebarProps {
  cluster?: Partial<Cluster>;
  gpuDetails?: ClusterGPU | null;
  isLoading?: boolean;
}

export function ClusterSidebar({
  cluster,
  gpuDetails,
  isLoading,
}: ClusterSidebarProps) {
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        <div className="space-y-4">
          <div className="h-32 w-full bg-muted animate-pulse rounded" />
          <div className="h-32 w-full bg-muted animate-pulse rounded" />
        </div>
      </div>
    );
  }

  if (!cluster) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-2 border border-dashed rounded-lg">
        <Server className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Select a cluster to view details
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Server className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold tracking-tight">Cluster Detail</h2>
      </div>

      <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">{cluster.name}</CardTitle>
            <Badge
              variant={
                cluster.status === "operational" ? "default" : "destructive"
              }
              className="capitalize"
            >
              {cluster.status}
            </Badge>
          </div>
          <CardDescription className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {cluster.location}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="h-px w-full bg-border/50" />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <Cpu className="h-3 w-3" /> Hardware
              </span>
              <p className="font-medium text-foreground text-xs leading-tight">
                {cluster.gpus || cluster.cluster_gpus?.length}{" "}
                {gpuDetails ? `${gpuDetails.model}` : "NVIDIA Hardware"}
                {gpuDetails && (
                  <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">
                    {gpuDetails.memory_gb}GB VRAM •{" "}
                    {gpuDetails.cores.toLocaleString()} Cores/Unit
                  </span>
                )}
              </p>
            </div>
            <div className="space-y-1 text-right">
              <span className="text-muted-foreground flex items-center gap-1 justify-end">
                <Activity className="h-3 w-3" /> Latency
              </span>
              <p
                className={cn(
                  "font-medium",
                  cluster.avg_latency !== null &&
                    cluster.avg_latency !== undefined &&
                    cluster.avg_latency < 4
                    ? "text-green-500"
                    : "text-yellow-500",
                )}
              >
                {cluster.avg_latency?.toFixed(1) || "0.0"}ms
              </p>
            </div>
          </div>

          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${cluster.uptime}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
            <span>Uptime History</span>
            <span>{cluster.uptime}% Reliability</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-border/50 bg-background/50 hover:bg-muted transition-colors text-left font-medium"
          >
            <CheckCircle className="h-4 w-4 text-green-500" />
            Validate Ledger Proof
          </button>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 text-sm rounded-md border border-border/50 bg-background/50 hover:bg-muted transition-colors text-left font-medium text-destructive"
          >
            <AlertTriangle className="h-4 w-4" />
            Initiate Slashing Review
          </button>
        </div>
      </div>
    </div>
  );
}
