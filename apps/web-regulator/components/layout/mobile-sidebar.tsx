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
  Menu,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/kill-switch",
    label: "Kill Switch",
    icon: Shield,
  },
  {
    href: "/admin/secrets",
    label: "Secrets",
    icon: Key,
  },
  {
    href: "/flags",
    label: "Flag Management",
    icon: Flag,
  },
  {
    href: "/machines",
    label: "Machines",
    icon: Server,
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
  },
  {
    href: "/billing",
    label: "Billing",
    icon: CreditCard,
  },
  {
    href: "/docs",
    label: "Documentation",
    icon: BookOpen,
  },
];

export function MobileSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <>
      {/* Mobile top bar — visible only on small screens */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center justify-between border-b bg-card px-3 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Open navigation menu"
              aria-expanded={open}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-60 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation Menu</SheetTitle>
            </SheetHeader>

            {/* Brand */}
            <div className="flex h-14 items-center gap-2 px-4">
              <Shield className="h-5 w-5 text-primary" />
              <span className="font-bold tracking-tight">ALYGN</span>
            </div>

            <Separator />

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto py-3">
              <ul className="space-y-0.5 px-2">
                {NAV_ITEMS.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                        onClick={() => setOpen(false)}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <Separator />

            {/* User section */}
            <div className="p-3">
              <div className="flex items-center gap-3 px-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start text-xs">
                  <span className="font-medium truncate max-w-[120px]">
                    {user?.name ?? "User"}
                  </span>
                  <span className="text-muted-foreground truncate max-w-[120px]">
                    {user?.email}
                  </span>
                </div>
              </div>
              <Button
                variant="ghost"
                className="mt-2 w-full justify-start text-xs text-destructive hover:text-destructive"
                onClick={() => {
                  logout();
                  setOpen(false);
                }}
              >
                Sign out
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* Mobile brand */}
        <Link href="/" className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold tracking-tight">ALYGN</span>
        </Link>
      </div>
    </>
  );
}
