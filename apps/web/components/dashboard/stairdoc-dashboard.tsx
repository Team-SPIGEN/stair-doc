"use client";

import { useState, useCallback } from "react";
import { useRobotSocket } from "@/hooks/use-robot-socket";
import type { DeliveryUpdatePayload } from "@/hooks/use-robot-socket";
import type { ActivityEvent } from "@/types/dashboard";
import {
  StatsCard,
  RobotStatusCard,
  ActivityFeed,
  EmergencyStopButton,
  EmergencyStopBanner,
  DashboardLoading,
  DashboardError,
  ConnectionStatus,
  BatteryGaugeCircular,
} from "@/components/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Package,
  ArrowUpDown,
  TrendingUp,
  Clock,
  Zap,
  RefreshCw,
  ChevronRight,
  MapPin,
} from "lucide-react";

/** Monotonic counter for unique event IDs. */
let _seq = 0;
function nextId(): string {
  return `evt-${Date.now()}-${++_seq}`;
}

export function StairDocDashboard() {
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);

  // Track delivery updates as activity events
  const handleDeliveryUpdate = useCallback((data: DeliveryUpdatePayload) => {
    const event: ActivityEvent = {
      id: nextId(),
      type: "delivery",
      robotId: data.robot_id ?? undefined,
      message: data.message,
      timestamp: data.timestamp,
      severity: data.type === "emergency_stop" ? "error" : "info",
    };
    setActivities((prev) => [event, ...prev].slice(0, 50));
  }, []);

  const {
    isConnected,
    robots,
    systemHealth,
    tickCount,
    sendCommand,
  } = useRobotSocket({
    onDeliveryUpdate: handleDeliveryUpdate,
  });

  const selectedRobot = robots.find((r) => r.id === selectedRobotId) ?? null;

  // Derive stats from real data
  const activeCount = robots.filter((r) =>
    ["delivering", "climbing", "descending", "returning"].includes(r.status),
  ).length;
  const chargingCount = robots.filter((r) => r.status === "charging").length;
  const totalDeliveries = robots.reduce((s, r) => s + r.total_deliveries, 0);
  const totalStairs = robots.reduce((s, r) => s + r.stairs_climbed, 0);
  const avgBattery = robots.length
    ? Math.round(robots.reduce((s, r) => s + r.battery.level, 0) / robots.length)
    : 0;

  const hasEmergency = robots.some((r) => r.status === "emergency");

  // Show loading only before the first telemetry tick
  if (robots.length === 0 && tickCount === 0) {
    return <DashboardLoading />;
  }

  return (
    <div className="space-y-6">
      {/* Emergency Banner */}
      {hasEmergency && (
        <EmergencyStopBanner
          onEmergencyStop={async () => sendCommand("resume")}
          isActive={hasEmergency}
        />
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Stair-Doc Dashboard
          </h1>
          <p className="text-muted-foreground">
            Real-time monitoring and control for your delivery robot fleet
            {robots.length > 0 && (
              <> &middot; {robots.length} robot{robots.length !== 1 ? "s" : ""}</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus isConnected={isConnected} />
          {tickCount > 0 && (
            <span className="text-xs text-muted-foreground">
              tick #{tickCount}
            </span>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Robots"
          value={`${activeCount}/${robots.length}`}
          subtitle={`${chargingCount} charging`}
          icon={Bot}
          gradient="blue"
        />
        <StatsCard
          title="Total Deliveries"
          value={totalDeliveries.toLocaleString()}
          subtitle="All-time fleet total"
          icon={Package}
          gradient="green"
        />
        <StatsCard
          title="Stairs Climbed"
          value={totalStairs.toLocaleString()}
          subtitle="Fleet total flights"
          icon={ArrowUpDown}
          gradient="purple"
        />
        <StatsCard
          title="Avg. Battery"
          value={`${avgBattery}%`}
          subtitle={`${robots.length} robot${robots.length !== 1 ? "s" : ""} online`}
          icon={Zap}
          gradient="orange"
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Robot Fleet */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              Robot Fleet
              {isConnected && (
                <Zap className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
              )}
            </h2>
            <Button variant="ghost" size="sm" asChild>
              <a href="/dashboard">
                View Details <ChevronRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {robots.map((robot) => (
              <RobotStatusCard
                key={robot.id}
                robot={robot}
                isSelected={selectedRobot?.id === robot.id}
                onSelect={setSelectedRobotId}
              />
            ))}
          </div>
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Selected Robot Details / Emergency Stop */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Emergency Stop */}
            <Card className="flex flex-col items-center justify-center p-6">
              <EmergencyStopButton
                onEmergencyStop={async () =>
                  sendCommand("emergency_stop", selectedRobot?.id ?? undefined)
                }
                robotName={selectedRobot?.name}
              />
            </Card>

            {/* Selected Robot Battery */}
            {selectedRobot ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">
                    {selectedRobot.name} Battery
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center pt-2">
                  <BatteryGaugeCircular
                    level={selectedRobot.battery.level}
                    isCharging={selectedRobot.battery.is_charging}
                    size={100}
                  />
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {selectedRobot.location.building}, Floor{" "}
                      {selectedRobot.location.floor}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex items-center justify-center">
                <CardContent className="text-center py-8">
                  <Bot className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    Select a robot to view details
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Activity Feed */}
          <ActivityFeed activities={activities} maxItems={8} />
        </div>
      </div>

      {/* Quick Stats Footer */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
              <TrendingUp className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{robots.length}</p>
              <p className="text-sm text-muted-foreground">
                Robots Connected
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10">
              <Clock className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{avgBattery}%</p>
              <p className="text-sm text-muted-foreground">
                Fleet Avg Battery
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-500/10">
              <ArrowUpDown className="h-6 w-6 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalStairs.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">
                Total Flights Climbed
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
