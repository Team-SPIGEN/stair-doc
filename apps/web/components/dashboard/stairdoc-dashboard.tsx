"use client";

import { useStairDocDashboard } from "@/hooks/use-stairdoc-dashboard";
import {
  StatsCard,
  RobotCard,
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

export function StairDocDashboard() {
  const {
    isConnected,
    isLoading,
    error,
    robots,
    activities,
    stats,
    selectedRobot,
    selectRobot,
    sendEmergencyStop,
    refreshData,
  } = useStairDocDashboard();

  if (isLoading) {
    return <DashboardLoading />;
  }

  if (error) {
    return <DashboardError error={error} onRetry={refreshData} />;
  }

  const hasEmergency = robots.some((r) => r.status === "emergency");

  return (
    <div className="space-y-6">
      {/* Emergency Banner */}
      {hasEmergency && (
        <EmergencyStopBanner
          onEmergencyStop={() => sendEmergencyStop()}
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
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus isConnected={isConnected} />
          <Button variant="outline" size="sm" onClick={refreshData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Active Robots"
          value={`${stats.activeRobots}/${stats.totalRobots}`}
          subtitle={`${stats.robotsCharging} charging`}
          icon={Bot}
          gradient="blue"
          trend={{ value: 12, isPositive: true }}
        />
        <StatsCard
          title="Deliveries Today"
          value={stats.deliveriesToday}
          subtitle={`${stats.successRate}% success rate`}
          icon={Package}
          gradient="green"
          trend={{ value: 8, isPositive: true }}
        />
        <StatsCard
          title="Stairs Climbed"
          value={stats.stairsClimbedToday}
          subtitle="Today's total"
          icon={ArrowUpDown}
          gradient="purple"
          trend={{ value: 15, isPositive: true }}
        />
        <StatsCard
          title="Avg. Delivery Time"
          value={`${stats.avgDeliveryTime}m`}
          subtitle={`${stats.pendingDeliveries} pending`}
          icon={Clock}
          gradient="orange"
          trend={{ value: 5, isPositive: false }}
        />
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-4">
        {/* Robot Fleet */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Robot Fleet</h2>
            <Button variant="ghost" size="sm">
              View All <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {robots.map((robot) => (
              <RobotCard
                key={robot.id}
                robot={robot}
                isSelected={selectedRobot?.id === robot.id}
                onSelect={selectRobot}
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
                onEmergencyStop={() =>
                  sendEmergencyStop(selectedRobot?.id)
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
                    level={selectedRobot.batteryLevel}
                    isCharging={selectedRobot.status === "charging"}
                    size={100}
                  />
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {selectedRobot.currentLocation.building}, Floor{" "}
                      {selectedRobot.currentLocation.floor}
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
              <p className="text-2xl font-bold">98.2%</p>
              <p className="text-sm text-muted-foreground">
                Delivery Success Rate
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-500/10">
              <Zap className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">24/7</p>
              <p className="text-sm text-muted-foreground">
                System Uptime
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
              <p className="text-2xl font-bold">1,247</p>
              <p className="text-sm text-muted-foreground">
                Total Flights This Week
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
