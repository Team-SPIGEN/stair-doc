"use client";

import { useState } from "react";
import { useApi } from "@/hooks/use-api";
import { fetchAllRobotStatus } from "@/lib/api/robot-status";
import type { RobotStatusResponse } from "@/lib/api/robot-status";
import {
  RobotStatusCard,
  LocationMap,
  EmergencyStopButton,
  DashboardError,
} from "@/components/dashboard";
import { BatteryGaugeCircular } from "@/components/dashboard/battery-gauge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot,
  Package,
  ArrowUpDown,
  RefreshCw,
  Activity,
  MapPin,
  Gauge,
  Wifi,
  WifiOff,
} from "lucide-react";

const POLL_INTERVAL = 5000; // 5s polling to keep data fresh

export default function DashboardPage() {
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useApi(() => fetchAllRobotStatus(), { pollInterval: POLL_INTERVAL });

  const robots = data?.robots ?? [];
  const selectedRobot = robots.find((r) => r.id === selectedRobotId) ?? null;

  // Derived stats
  const activeCount = robots.filter((r) =>
    ["delivering", "climbing", "descending", "returning"].includes(r.status),
  ).length;
  const chargingCount = robots.filter((r) => r.status === "charging").length;
  const totalDeliveries = robots.reduce((s, r) => s + r.total_deliveries, 0);
  const totalStairs = robots.reduce((s, r) => s + r.stairs_climbed, 0);

  // Loading skeleton
  if (isLoading && robots.length === 0) {
    return <DashboardSkeleton />;
  }

  if (error && robots.length === 0) {
    return <DashboardError error={error} onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Robot Status Dashboard
          </h1>
          <p className="text-muted-foreground text-sm">
            Live status from <code className="text-xs">/api/v1/robot/status</code>
            {data && (
              <> &middot; {robots.length} robot{robots.length !== 1 ? "s" : ""}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {error ? (
              <WifiOff className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            )}
            {error ? "Error" : "Live"}
          </span>
          <Button variant="outline" size="sm" onClick={refetch}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <QuickStat icon={Bot} label="Active" value={`${activeCount}/${robots.length}`} sub={`${chargingCount} charging`} />
        <QuickStat icon={Package} label="Deliveries" value={totalDeliveries.toLocaleString()} sub="All-time total" />
        <QuickStat icon={ArrowUpDown} label="Stairs Today" value={totalStairs.toLocaleString()} sub="Flights climbed" />
        <QuickStat icon={Activity} label="Avg Battery" value={`${robots.length ? Math.round(robots.reduce((s, r) => s + r.battery.level, 0) / robots.length) : 0}%`} sub="Fleet average" />
      </div>

      {/* Main content: Cards + Map */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Robot Status Cards */}
        <div className="lg:col-span-3 space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" /> Robot Fleet
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {robots.map((robot) => (
              <RobotStatusCard
                key={robot.id}
                robot={robot}
                isSelected={robot.id === selectedRobotId}
                onSelect={setSelectedRobotId}
              />
            ))}
          </div>
        </div>

        {/* Right: Map + Selected Robot Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Location Map */}
          <LocationMap
            robots={robots}
            selectedRobotId={selectedRobotId}
            onSelectRobot={setSelectedRobotId}
          />

          {/* Selected Robot Detail / Emergency Stop */}
          {selectedRobot ? (
            <SelectedRobotPanel
              robot={selectedRobot}
              onEmergencyStop={async () => {
                console.log("Emergency stop:", selectedRobot.id);
              }}
            />
          ) : (
            <Card className="flex items-center justify-center py-10">
              <CardContent className="text-center">
                <Bot className="mx-auto h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Select a robot for details
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function QuickStat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SelectedRobotPanel({
  robot,
  onEmergencyStop,
}: {
  robot: RobotStatusResponse;
  onEmergencyStop: () => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{robot.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Battery */}
        <div className="flex flex-col items-center">
          <BatteryGaugeCircular
            level={robot.battery.level}
            isCharging={robot.battery.is_charging}
            size={90}
            strokeWidth={10}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {robot.battery.estimated_minutes_remaining}m remaining &middot;{" "}
            {robot.battery.temperature.toFixed(0)}°C
          </p>
        </div>

        {/* Location */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span>
            {robot.location.building}, Floor {robot.location.floor}
            {robot.location.room ? ` · ${robot.location.room}` : ""}
          </span>
        </div>

        {/* Speed + sensor */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge className="h-3.5 w-3.5" />
            <span>{robot.speed.toFixed(1)} m/s</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>{robot.sensors.incline_angle.toFixed(0)}° incline</span>
          </div>
        </div>

        {/* Emergency Stop */}
        <div className="pt-2 flex justify-center">
          <EmergencyStopButton
            onEmergencyStop={onEmergencyStop}
            robotName={robot.name}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
        <div className="lg:col-span-2 space-y-4">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
