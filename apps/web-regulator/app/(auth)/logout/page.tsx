"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Loader2, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { BRAND_FULL_NAME } from "@/lib/branding";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LogoutPage() {
  const router = useRouter();
  const { logout, user, isAuthenticated } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, router]);

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
    router.replace("/login");
  }

  function handleCancel() {
    router.back();
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 px-4">
      <div className="mb-6 flex items-center gap-2">
        <Shield className="h-8 w-8 text-primary" />
        <span className="text-xl font-bold tracking-tight">{BRAND_FULL_NAME}</span>
      </div>

      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <LogOut className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Sign Out</CardTitle>
          <CardDescription>
            Are you sure you want to sign out?
            {user && (
              <span className="block truncate text-xs text-muted-foreground mt-1">
                Signed in as {user.email}
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleCancel}
              disabled={isLoggingOut}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing out…
                </>
              ) : (
                "Sign Out"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
