"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BatteryGaugeCircular } from "@/components/dashboard/battery-gauge";
import type { RobotStatusResponse, LockStatusType } from "@/lib/api/robot-status";
import {
  Bot,
  Lock,
  LockOpen,
  AlertTriangle,
  MapPin,
  Gauge,
  Weight,
  Timer,
  ArrowUpDown,
  Package,
} from "lucide-react";

// ── Status helpers ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  idle: { label: "Idle", color: "text-slate-500", dot: "bg-slate-500" },
  climbing: { label: "Climbing", color: "text-amber-500", dot: "bg-amber-500" },
  descending: { label: "Descending", color: "text-sky-500", dot: "bg-sky-500" },
  delivering: { label: "Delivering", color: "text-blue-500", dot: "bg-blue-500" },
  returning: { label: "Returning", color: "text-indigo-500", dot: "bg-indigo-500" },
  charging: { label: "Charging", color: "text-emerald-500", dot: "bg-emerald-500" },
  maintenance: { label: "Maintenance", color: "text-orange-500", dot: "bg-orange-500" },
  emergency: { label: "EMERGENCY", color: "text-red-600", dot: "bg-red-600 animate-pulse" },
  offline: { label: "Offline", color: "text-muted-foreground", dot: "bg-muted-foreground" },
};

function LockIcon({ status }: { status: LockStatusType }) {
  switch (status) {
    case "locked":
      return (
        <div className="flex items-center gap-1.5 text-emerald-500">
          <Lock className="h-4 w-4" />
          <span className="text-xs font-medium">Locked</span>
        </div>
      );
    case "unlocked":
      return (
        <div className="flex items-center gap-1.5 text-amber-500">
          <LockOpen className="h-4 w-4" />
          <span className="text-xs font-medium">Unlocked</span>
        </div>
      );
    case "error":
      return (
        <div className="flex items-center gap-1.5 text-red-500">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-xs font-medium">Lock Error</span>
        </div>
      );
  }
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Component ───────────────────────────────────────────────────────────

interface RobotStatusCardProps {
  robot: RobotStatusResponse;
  isSelected?: boolean;
  onSelect?: (robotId: string) => void;
  className?: string;
}

export function RobotStatusCard({
  robot,
  isSelected = false,
  onSelect,
  className,
}: RobotStatusCardProps) {
  const cfg = STATUS_CONFIG[robot.status] ?? STATUS_CONFIG.offline;

  return (
    <Card
      className={cn(
        "transition-all duration-200 hover:shadow-md cursor-pointer touch-manipulation",
        isSelected && "ring-2 ring-primary shadow-lg",
        robot.status === "emergency" && "border-red-500/50 bg-red-500/5",
        className,
      )}
      onClick={() => onSelect?.(robot.id)}
    >
      {/* Header: Name + Status + Lock */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold leading-tight">
                {robot.name}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{robot.serial_number}</p>
            </div>
          </div>
          <LockIcon status={robot.lock_status} />
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
          <span className={cn("text-xs font-medium", cfg.color)}>{cfg.label}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Battery Gauge (centered) */}
        <div className="flex flex-col items-center">
          <BatteryGaugeCircular
            level={robot.battery.level}
            isCharging={robot.battery.is_charging}
            size={90}
            strokeWidth={10}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {robot.battery.estimated_minutes_remaining}m remaining &middot;{" "}
            {robot.battery.voltage.toFixed(1)}V
          </p>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {robot.location.building}, F{robot.location.floor}
              {robot.location.room ? ` · ${robot.location.room}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Gauge className="h-3.5 w-3.5 shrink-0" />
            <span>{robot.speed.toFixed(1)} m/s</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Weight className="h-3.5 w-3.5 shrink-0" />
            <span>{robot.sensors.weight_kg.toFixed(1)} kg</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Timer className="h-3.5 w-3.5 shrink-0" />
            <span>{formatUptime(robot.uptime_seconds)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
            <span>{robot.stairs_climbed} stairs</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="h-3.5 w-3.5 shrink-0" />
            <span>{robot.total_deliveries} deliveries</span>
          </div>
        </div>

        {/* Sensor Alerts */}
        {(robot.sensors.obstacle_detected || robot.sensors.stair_detected) && (
          <div className="flex flex-wrap gap-2">
            {robot.sensors.stair_detected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600">
                <ArrowUpDown className="h-3 w-3" />
                Stairs detected
              </span>
            )}
            {robot.sensors.obstacle_detected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600">
                <AlertTriangle className="h-3 w-3" />
                Obstacle {robot.sensors.distance_to_obstacle?.toFixed(1)}m
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
