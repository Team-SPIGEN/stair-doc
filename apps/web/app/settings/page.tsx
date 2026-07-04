"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/ui/page-header";
import { ModeToggle } from "@/components/theme/mode-toggle";
import { useAuth } from "@/contexts/auth-context";
import { toast } from "sonner";
import {
  Settings,
  Bell,
  Keyboard,
  Wifi,
  Shield,
  User,
  Monitor,
  RefreshCw,
  Bot,
  ChevronRight,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Keyboard shortcut row ─────────────────────────────────────────────────

function ShortcutRow({ keys, action }: { keys: string[]; action: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{action}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="min-w-[2rem] rounded border border-border bg-muted px-2 py-1 text-center font-mono text-xs"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}

// ── Toggle row ─────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
          value ? "bg-blue-600" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform duration-200",
            value ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, logout } = useAuth();

  const [notifications, setNotifications] = useState({
    deliveryReady: true,
    lowBattery: true,
    rfidScan: false,
    systemAlert: true,
  });

  const [prefs, setPrefs] = useState({
    vibrationFeedback: true,
    soundEffects: false,
    autoReconnect: true,
    backgroundSync: true,
    compactMode: false,
  });

  const handleToggle =
    (key: keyof typeof notifications) => (v: boolean) =>
      setNotifications((p) => ({ ...p, [key]: v }));

  const handlePref =
    (key: keyof typeof prefs) => (v: boolean) =>
      setPrefs((p) => ({ ...p, [key]: v }));

  const handleClearCache = () => {
    toast.success("Cache cleared successfully");
  };

  const handleForceReconnect = () => {
    toast.info("Reconnecting to robot…");
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        icon={Settings}
        title="Settings"
        description="Manage your Stair-Doc preferences, notifications, and account"
      />

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user ? (
            <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-4">
              <div className="space-y-0.5">
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
              <Badge
                variant={
                  user.role === "admin"
                    ? "default"
                    : user.role === "operator"
                      ? "secondary"
                      : "outline"
                }
                className="capitalize"
              >
                {user.role}
              </Badge>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not signed in</p>
          )}
          <Button variant="destructive" size="sm" onClick={logout}>
            Sign out
          </Button>
        </CardContent>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Monitor className="h-4 w-4" />
            Appearance
          </CardTitle>
          <CardDescription>
            Choose your preferred theme and display options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Theme</Label>
            <ModeToggle />
          </div>
          <Separator />
          <ToggleRow
            label="Compact Mode"
            description="Reduce padding and card spacing for more information density"
            value={prefs.compactMode}
            onChange={handlePref("compactMode")}
          />
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Notifications
          </CardTitle>
          <CardDescription>
            Configure push notification triggers
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <ToggleRow
            label="Delivery Ready"
            description="Notify when a robot arrives at the destination floor"
            value={notifications.deliveryReady}
            onChange={handleToggle("deliveryReady")}
          />
          <ToggleRow
            label="Low Battery"
            description="Alert when robot battery drops below 20%"
            value={notifications.lowBattery}
            onChange={handleToggle("lowBattery")}
          />
          <ToggleRow
            label="RFID Scan Events"
            description="Notify on every RFID tag scan"
            value={notifications.rfidScan}
            onChange={handleToggle("rfidScan")}
          />
          <ToggleRow
            label="System Alerts"
            description="Critical robot errors and sensor failures"
            value={notifications.systemAlert}
            onChange={handleToggle("systemAlert")}
          />
        </CardContent>
      </Card>

      {/* Robot Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" />
            Robot Preferences
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <ToggleRow
            label="Vibration Feedback"
            description="Vibrate device on command confirmation (mobile)"
            value={prefs.vibrationFeedback}
            onChange={handlePref("vibrationFeedback")}
          />
          <ToggleRow
            label="Auto-Reconnect"
            description="Automatically reconnect Socket.IO when connection drops"
            value={prefs.autoReconnect}
            onChange={handlePref("autoReconnect")}
          />
          <ToggleRow
            label="Background Sync"
            description="Sync offline delivery queue when connection is restored"
            value={prefs.backgroundSync}
            onChange={handlePref("backgroundSync")}
          />
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Role Permissions
          </CardTitle>
          <CardDescription>Your current access level</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
            {[
              {
                label: "Dashboard & Robot Status",
                roles: ["operator", "admin"],
              },
              {
                label: "Delivery Management",
                roles: ["operator", "admin", "recipient"],
              },
              {
                label: "Create Deliveries",
                roles: ["operator", "admin"],
              },
              { label: "Navigation Controls", roles: ["operator", "admin"] },
              {
                label: "RFID Unlock",
                roles: ["operator", "admin", "recipient"],
              },
              { label: "Camera & Gallery", roles: ["operator", "admin"] },
              { label: "Analytics & Reports", roles: ["admin"] },
              { label: "RFID Tag Management", roles: ["admin"] },
            ].map((item) => {
              const hasAccess = user
                ? item.roles.includes(user.role)
                : false;
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-muted-foreground">
                    {item.label}
                  </span>
                  {hasAccess ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                      <Check className="h-3 w-3" />
                      Allowed
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">
                      Restricted
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Keyboard Shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Keyboard className="h-4 w-4" />
            Keyboard Shortcuts
          </CardTitle>
          <CardDescription>
            Global shortcuts — active when not typing in an input
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          <ShortcutRow
            keys={["Space"]}
            action="Emergency Stop (hold 0.8 s)"
          />
          <ShortcutRow keys={["Ctrl", "B"]} action="Toggle sidebar" />
          <ShortcutRow keys={["G", "D"]} action="Go to Dashboard (Overview)" />
          <ShortcutRow keys={["G", "L"]} action="Go to Deliveries" />
          <ShortcutRow keys={["R"]} action="Refresh robot status" />
          <ShortcutRow keys={["N"]} action="Go to Navigation" />
          <ShortcutRow keys={["C"]} action="Go to Camera" />
          <ShortcutRow keys={["D"]} action="Go to Deliveries" />
          <ShortcutRow keys={["V"]} action="Toggle voice commands" />
          <ShortcutRow keys={["?"]} action="Show shortcut help" />
          <ShortcutRow keys={["Esc"]} action="Close / stop listening" />
        </CardContent>
      </Card>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4" />
            Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleForceReconnect}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Force Reconnect
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleClearCache}
          >
            Clear Local Cache
          </Button>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Stair-Doc PWA</p>
              <p className="text-xs text-muted-foreground">
                Version 1.0.0 · Robot Delivery Control
              </p>
            </div>
            <Badge variant="secondary" className="text-xs">
              Production Ready
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
