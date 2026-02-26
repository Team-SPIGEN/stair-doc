"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BatteryGauge } from "./battery-gauge";
import { 
  Bot, 
  MapPin, 
  Package, 
  Zap, 
  ArrowUpDown,
  Pause,
  Play,
  AlertTriangle,
  Wifi,
  WifiOff
} from "lucide-react";
import type { Robot, RobotStatus } from "@/types/dashboard";

interface RobotCardProps {
  robot: Robot;
  isSelected?: boolean;
  onSelect?: (robotId: string) => void;
  className?: string;
}

const statusConfig: Record<RobotStatus, { label: string; color: string; icon: typeof Bot }> = {
  idle: { label: "Idle", color: "text-slate-500 bg-slate-500/10", icon: Pause },
  climbing: { label: "Climbing", color: "text-purple-500 bg-purple-500/10", icon: ArrowUpDown },
  descending: { label: "Descending", color: "text-indigo-500 bg-indigo-500/10", icon: ArrowUpDown },
  delivering: { label: "Delivering", color: "text-blue-500 bg-blue-500/10", icon: Package },
  returning: { label: "Returning", color: "text-cyan-500 bg-cyan-500/10", icon: Bot },
  charging: { label: "Charging", color: "text-emerald-500 bg-emerald-500/10", icon: Zap },
  maintenance: { label: "Maintenance", color: "text-amber-500 bg-amber-500/10", icon: AlertTriangle },
  emergency: { label: "EMERGENCY", color: "text-red-500 bg-red-500/10", icon: AlertTriangle },
  offline: { label: "Offline", color: "text-gray-500 bg-gray-500/10", icon: WifiOff },
};

export function RobotCard({
  robot,
  isSelected = false,
  onSelect,
  className,
}: RobotCardProps) {
  const status = statusConfig[robot.status];
  const StatusIcon = status.icon;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-300 hover:shadow-lg",
        isSelected && "ring-2 ring-primary shadow-lg",
        robot.status === "emergency" && "border-red-500 animate-pulse",
        className
      )}
      onClick={() => onSelect?.(robot.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg", status.color)}>
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold">{robot.name}</h4>
              <p className="text-xs text-muted-foreground">{robot.serialNumber}</p>
            </div>
          </div>
          <div className={cn("px-2 py-1 rounded-full text-xs font-medium", status.color)}>
            <div className="flex items-center gap-1">
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Battery */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Battery</span>
          <BatteryGauge
            level={robot.batteryLevel}
            isCharging={robot.status === "charging"}
            size="sm"
          />
        </div>

        {/* Location */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Location</span>
          <div className="flex items-center gap-1 text-sm">
            <MapPin className="h-3 w-3" />
            <span>
              {robot.currentLocation.building}, Floor {robot.currentLocation.floor}
            </span>
          </div>
        </div>

        {/* Speed */}
        {robot.status !== "idle" && robot.status !== "charging" && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Speed</span>
            <span className="text-sm font-medium">{robot.speed.toFixed(1)} m/s</span>
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="text-center">
            <p className="text-lg font-bold">{robot.totalDeliveries}</p>
            <p className="text-xs text-muted-foreground">Deliveries</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold">{robot.stairsClimbed}</p>
            <p className="text-xs text-muted-foreground">Stairs</p>
          </div>
          <div className="text-center flex items-center gap-1">
            {robot.status !== "offline" ? (
              <Wifi className="h-4 w-4 text-emerald-500" />
            ) : (
              <WifiOff className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface RobotCardSkeletonProps {
  className?: string;
}

export function RobotCardSkeleton({ className }: RobotCardSkeletonProps) {
  return (
    <Card className={cn("animate-pulse", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-muted" />
            <div className="space-y-2">
              <div className="h-4 w-24 bg-muted rounded" />
              <div className="h-3 w-20 bg-muted rounded" />
            </div>
          </div>
          <div className="h-6 w-16 bg-muted rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-between">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-20 bg-muted rounded" />
        </div>
        <div className="flex justify-between">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-32 bg-muted rounded" />
        </div>
        <div className="flex justify-between pt-2 border-t">
          <div className="h-8 w-12 bg-muted rounded" />
          <div className="h-8 w-12 bg-muted rounded" />
          <div className="h-8 w-8 bg-muted rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
