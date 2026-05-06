"use client";

import { Settings, Shield } from "lucide-react";
import { ErrorBoundary, SectionErrorBoundary } from "@/components/error-boundary";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SettingsPage() {
  return (
    <ErrorBoundary>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            System configuration and preferences
          </p>
        </div>

        <Separator />

        {/* General Settings */}
        <SectionErrorBoundary title="General Settings">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">General</CardTitle>
              <CardDescription>
                Basic system configuration options
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Auto-poll Status</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically refresh kill switch status every 5 seconds
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Enable Notifications</Label>
                  <p className="text-xs text-muted-foreground">
                    Receive desktop notifications for state changes
                  </p>
                </div>
                <Switch defaultChecked />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Audit Log Retention</Label>
                  <p className="text-xs text-muted-foreground">
                    Days to keep activation history records
                  </p>
                </div>
                <Input
                  type="number"
                  defaultValue={30}
                  className="w-20"
                  min={1}
                  max={365}
                />
              </div>
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        {/* Security Settings */}
        <SectionErrorBoundary title="Security">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Security</CardTitle>
              <CardDescription>
                Authentication and access control settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Session Timeout</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically log out after inactivity (minutes)
                  </p>
                </div>
                <Input
                  type="number"
                  defaultValue={60}
                  className="w-20"
                  min={5}
                  max={480}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">IP Allowlist</Label>
                  <p className="text-xs text-muted-foreground">
                    Restrict dashboard access to specific IPs
                  </p>
                </div>
                <Switch />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium">Rate Limiting</Label>
                  <p className="text-xs text-muted-foreground">
                    Limit API requests per minute
                  </p>
                </div>
                <Input
                  type="number"
                  defaultValue={100}
                  className="w-20"
                  min={10}
                  max={1000}
                />
              </div>
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        {/* About */}
        <SectionErrorBoundary title="About">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">About</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-sm font-medium">ALYGN Regulator v2.0.0</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Sovereign Compliance Infrastructure for AI Safety.
                    Backend: Bun + Elysia + Better-Auth + SQLite.
                    Frontend: Next.js 16 + shadcn/ui + Tailwind CSS v4.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </SectionErrorBoundary>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={() => toast.success("Settings saved")}>
            Save Settings
          </Button>
        </div>
      </div>
    </ErrorBoundary>
  );
}
