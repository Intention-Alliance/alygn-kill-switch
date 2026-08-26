"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  LayoutDashboard,
  Key,
  Flag,
  Server,
  Settings,
  BookOpen,
  CreditCard,
  PanelLeftClose,
  PanelLeft,
  ArrowRight,
  CircleCheck,
  CircleAlert,
  CircleOff,
  Clock,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { apiGet } from "@/lib/api-client";
import { SystemMetricsBar } from "@/components/machines/system-metrics";
import { MachineQuickActions } from "@/components/machines/machine-quick-actions";
import { effectiveStatus } from "@/lib/dashboard-utils";
import type { Machine, KillSwitchState } from "@/types/shared";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Compliance monitoring overview",
  },
  {
    href: "/admin/secrets",
    label: "Secrets",
    icon: Key,
    description: "Secret rotation & audit",
  },
  {
    href: "/flags",
    label: "Flag Management",
    icon: Flag,
    description: "Global flags & per-machine overrides",
  },
  {
    href: "/machines",
    label: "Machines",
    icon: Server,
    description: "Node registry & health monitoring",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    description: "System configuration",
  },
  {
    href: "/billing",
    label: "Billing",
    icon: CreditCard,
    description: "Subscription & payment methods",
  },
  {
    href: "/docs",
    label: "Documentation",
    icon: BookOpen,
    description: "Guides, API reference & troubleshooting",
  },
];

const MACHINE_STATUS_CONFIG: Record<
  Machine["status"],
  { label: string; variant: "default" | "destructive" | "secondary" }
> = {
  active: { label: "Active", variant: "default" },
  inactive: { label: "Inactive", variant: "secondary" },
  offline: { label: "Offline", variant: "destructive" },
  pending: { label: "Pending", variant: "secondary" },
};

const MACHINE_STATUS_ICON: Record<
  Machine["status"],
  { icon: typeof CircleCheck; color: string }
> = {
  active: { icon: CircleCheck, color: "text-emerald-500" },
  inactive: { icon: CircleAlert, color: "text-amber-500" },
  offline: { icon: CircleOff, color: "text-red-500" },
  pending: { icon: Clock, color: "text-amber-500" },
};

interface MachinesResponse {
  data: Machine[];
  total: number;
  limit: number;
  offset: number;
}

interface AppSidebarProps {
  className?: string;
  selectedMachine?: Machine | null;
  onMachineDeselect?: () => void;
  currentKillSwitchState?: KillSwitchState;
  onKillSwitchStateChange?: (state: KillSwitchState) => void;
}

export function AppSidebar({
  className,
  selectedMachine,
  onMachineDeselect,
  currentKillSwitchState,
  onKillSwitchStateChange,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // ─── Available machines list (always visible) ─────────────────
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [machinesError, setMachinesError] = useState<string | null>(null);

  const fetchMachines = useCallback(async () => {
    setMachinesLoading(true);
    try {
      const data = await apiGet<MachinesResponse>("/api/machines");
      setMachines(data.data ?? []);
      setMachinesError(null);
    } catch (err) {
      setMachinesError(
        err instanceof Error ? err.message : "Failed to load machines",
      );
    } finally {
      setMachinesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMachines();
  }, [fetchMachines]);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <aside
      className={cn(
        "md:flex h-screen flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-60",
        className,
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight">ALYGN</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/" className="mx-auto">
            <Shield className="h-5 w-5 text-primary" />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3">
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    collapsed && "justify-center px-2",
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Separator />

      {/* Available Machines — always visible (primary machine nav) */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Machines
              </span>
              <Link
                href="/machines"
                className="text-xs text-primary hover:underline"
              >
                View all
              </Link>
            </div>

            {machinesLoading ? (
              <div className="space-y-1.5">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : machinesError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <p>Couldn&apos;t load machines.</p>
                <button
                  type="button"
                  onClick={fetchMachines}
                  className="mt-1 text-primary underline hover:text-primary/80"
                >
                  Retry
                </button>
              </div>
            ) : machines.length === 0 ? (
              <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                No machines
              </div>
            ) : (
              <ul className="space-y-1">
                {machines.map((machine) => {
                  const status = effectiveStatus(machine);
                  const cfg = MACHINE_STATUS_CONFIG[status];
                  const StatusIcon = MACHINE_STATUS_ICON[status].icon;
                  const statusColor = MACHINE_STATUS_ICON[status].color;
                  const isActive =
                    pathname === `/machines/${machine.id}`;
                  return (
                    <li key={machine.id}>
                      <Link
                        href={`/machines/${machine.id}`}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <StatusIcon
                          className={cn("h-3.5 w-3.5 shrink-0", statusColor)}
                        />
                        <span className="flex-1 truncate">
                          {machine.name}
                        </span>
                        <Badge
                          variant={cfg?.variant ?? "secondary"}
                          className="capitalize text-[9px] shrink-0"
                        >
                          {cfg?.label ?? status}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <Separator />

      {/* Machine Context Panel */}
      {selectedMachine && !collapsed && (
        <>
          <Separator />
          <div className="flex-1 overflow-y-auto">
            <div className="p-3 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Server className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm font-semibold truncate">
                    {selectedMachine.name}
                  </span>
                </div>
                {(() => {
                  const cfg = MACHINE_STATUS_CONFIG[selectedMachine.status];
                  return (
                    <Badge
                      variant={cfg?.variant ?? "secondary"}
                      className="capitalize text-[10px] shrink-0"
                    >
                      {cfg?.label ?? selectedMachine.status}
                    </Badge>
                  );
                })()}
              </div>

              {/* Compact System Metrics */}
              <div className="rounded-md bg-muted/30 px-2 py-1.5">
                <SystemMetricsBar machine={selectedMachine} />
              </div>

              {/* Compact Quick Actions */}
              {currentKillSwitchState && onKillSwitchStateChange && (
                <MachineQuickActions
                  currentState={currentKillSwitchState}
                  onStateChange={onKillSwitchStateChange}
                />
              )}

              {/* View Details Link */}
              <Link
                href={`/machines/${selectedMachine.id}`}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors"
              >
                <span>View Details</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>

              {/* Deselect */}
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={onMachineDeselect}
              >
                Clear Selection
              </Button>
            </div>
          </div>
        </>
      )}

      {/* User section */}
      <div className={cn("p-3", collapsed && "px-2")}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-3 px-2",
                collapsed && "justify-center",
              )}
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex flex-col items-start text-xs">
                  <span className="font-medium truncate max-w-[120px]">
                    {user?.name ?? "User"}
                  </span>
                  <span className="text-muted-foreground truncate max-w-[120px]">
                    {user?.email}
                  </span>
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48">
            <DropdownMenuItem onClick={() => logout()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
