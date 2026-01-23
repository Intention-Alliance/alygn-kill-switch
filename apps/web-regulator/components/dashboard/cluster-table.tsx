"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Cluster } from "@/types/supabase.types";
import { useRouter } from "next/navigation";

interface ClusterTableProps {
  clusters: Cluster[];
  isLoading?: boolean;
}

export function ClusterTable({ clusters, isLoading }: ClusterTableProps) {
  const router = useRouter();

  return (
    <div className="rounded-md border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="font-semibold text-foreground">
              Name
            </TableHead>
            <TableHead className="font-semibold text-foreground">
              Location
            </TableHead>
            <TableHead className="font-semibold text-foreground">
              GPUs
            </TableHead>
            <TableHead className="font-semibold text-foreground">
              Latency
            </TableHead>
            <TableHead className="font-semibold text-foreground">
              Uptime
            </TableHead>
            <TableHead className="font-semibold text-foreground">
              Status
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center py-20 text-muted-foreground"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span>Scanning clusters...</span>
                </div>
              </TableCell>
            </TableRow>
          ) : clusters.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center py-20 text-muted-foreground"
              >
                No clusters found in the registry.
              </TableCell>
            </TableRow>
          ) : (
            clusters.map((cluster) => (
              <TableRow
                key={cluster.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors border-border/50"
                onClick={() => router.push(`/clusters/${cluster.slug}`)}
              >
                <TableCell className="font-medium">{cluster.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {cluster.location}
                </TableCell>
                <TableCell>
                  {cluster.gpus || cluster.cluster_gpus?.length}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      (cluster.avg_latency || 0.0) < 4
                        ? "text-green-500"
                        : "text-yellow-500"
                    }
                  >
                    {(cluster.avg_latency || 0.0).toFixed(1)}ms
                  </span>
                </TableCell>
                <TableCell>{(cluster.uptime || 0.0).toFixed(2)}%</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      cluster.status === "operational"
                        ? "default"
                        : cluster.status === "degraded"
                          ? "destructive"
                          : "outline"
                    }
                    className="capitalize shadow-none"
                  >
                    {cluster.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
