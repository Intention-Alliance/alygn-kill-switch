"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  LayoutDashboard,
  Key,
  Fingerprint,
  Flag,
  Server,
  Settings,
  BookOpen,
  CreditCard,
  PanelLeftClose,
  PanelLeft,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";
import { SystemMetricsBar } from "@/components/machines/system-metrics";
import { MachineQuickActions } from "@/components/machines/machine-quick-actions";
import type { Machine, KillSwitchState } from "@/types/shared";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Compliance monitoring overview",
  },
  {
    href: "/kill-switch",
    label: "Kill Switch",
    icon: Shield,
    description: "Emergency stop & state control",
  },
  {
    href: "/admin/secrets",
    label: "Secrets",
    icon: Key,
    description: "Tailscale secret rotation & audit",
  },
  {
    href: "/admin/security/fido2",
    label: "FIDO2 Keys",
    icon: Fingerprint,
    description: "Hardware security key management",
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
};

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
                {item.href === "/admin/security/fido2" && !collapsed && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Security
                  </p>
                )}
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
