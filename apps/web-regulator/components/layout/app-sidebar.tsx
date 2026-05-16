"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Shield,
  Flag,
  Server,
  Settings,
  BookOpen,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  {
    href: "/kill-switch",
    label: "Kill Switch",
    icon: Shield,
    description: "Emergency stop & state control",
  },
  {
    href: "/flags",
    label: "Flag Management",
    icon: Flag,
    description: "Feature flags & rollout control",
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
    href: "/docs",
    label: "Documentation",
    icon: BookOpen,
    description: "Guides, API reference & troubleshooting",
  },
];

interface AppSidebarProps {
  className?: string;
}

export function AppSidebar({ className }: AppSidebarProps) {
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
        "flex h-screen flex-col border-r bg-card transition-all duration-300",
        collapsed ? "w-16" : "w-60",
        className,
      )}
    >
      {/* Brand */}
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <Link href="/kill-switch" className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <span className="font-bold tracking-tight">ALYGN</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/kill-switch" className="mx-auto">
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
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
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
