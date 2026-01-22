"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  alert?: boolean;
  className?: string;
}

export function StatCard({
  icon,
  label,
  value,
  trend,
  trendUp,
  alert,
  className,
}: StatCardProps) {
  return (
    <Card className={cn(className, "border-border/50 bg-card/50 backdrop-blur-sm")}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className={cn("h-4 w-4", alert ? "text-destructive" : "text-muted-foreground")}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {trend && (
          <p className="text-xs text-muted-foreground mt-1">
            <span
              className={cn(
                "font-medium",
                alert ? "text-destructive" : trendUp ? "text-green-500" : "text-yellow-500"
              )}
            >
              {trend}
            </span>
            {trendUp !== undefined && " from last month"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
