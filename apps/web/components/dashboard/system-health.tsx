/**
 * System Health Indicators — real-time monitoring of backend infrastructure.
 *
 * Shows CPU, memory, network latency, LIDAR/camera status, database/MQTT
 * connectivity, and error counts from the `system_health` Socket.IO event.
 */
"use client";

import { cn } from "@/lib/utils";
import type { SystemHealthPayload } from "@/hooks/use-robot-socket";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Cpu,
  HardDrive,
  Wifi,
  Database,
  Radio,
  Camera,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Clock,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────

interface SystemHealthProps {
  health: SystemHealthPayload | null;
  isConnected: boolean;
  className?: string;
}

type ServiceStatus = "operational" | "degraded" | "offline";

// ── Helpers ──────────────────────────────────────────────────────────────

function statusColor(status: ServiceStatus | boolean): string {
  if (status === true || status === "operational") return "text-emerald-500";
  if (status === "degraded") return "text-amber-500";
  return "text-red-500";
}

function statusIcon(status: ServiceStatus | boolean) {
  if (status === true || status === "operational") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  }
  if (status === "degraded") {
    return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
  }
  return <XCircle className="h-3.5 w-3.5 text-red-500" />;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return `${h}h ${m}m`;
}

function usageBarColor(pct: number): string {
  if (pct >= 80) return "bg-red-500";
  if (pct >= 60) return "bg-amber-500";
  return "bg-emerald-500";
}

// ── Micro bar ────────────────────────────────────────────────────────────

function UsageBar({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span className={cn("font-medium", value >= 80 ? "text-red-500" : value >= 60 ? "text-amber-500" : "text-foreground")}>
          {value.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", usageBarColor(value))}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

// ── Service dot ──────────────────────────────────────────────────────────

function ServiceRow({ label, status, icon: Icon }: { label: string; status: ServiceStatus | boolean; icon: React.ElementType }) {
  const statusLabel = typeof status === "boolean" ? (status ? "Online" : "Offline") : status;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className={cn("flex items-center gap-1 capitalize", statusColor(status))}>
        {statusIcon(status)}
        {statusLabel}
      </span>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────

export function SystemHealth({ health, isConnected, className }: SystemHealthProps) {
  if (!health) {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            {isConnected ? "Waiting for data…" : "Not connected"}
          </p>
        </CardContent>
      </Card>
    );
  }

  const bridgeConnected =
    health.bridge_connected ?? (health.bridge?.connected_count ?? 0) > 0;

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" />
            System Health
          </CardTitle>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatUptime(health.uptime_seconds)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Resource usage bars */}
        <div className="space-y-2.5">
          <UsageBar label="CPU" value={health.cpu_usage} icon={Cpu} />
          <UsageBar label="Memory" value={health.memory_usage} icon={HardDrive} />
          <UsageBar label="Disk" value={health.disk_usage} icon={HardDrive} />
        </div>

        {/* Separator */}
        <div className="border-t" />

        {/* Service statuses */}
        <div className="space-y-2">
          <ServiceRow label="LIDAR" status={health.lidar_status} icon={Radio} />
          <ServiceRow label="Camera" status={health.camera_status} icon={Camera} />
          <ServiceRow label="Database" status={health.database_connected} icon={Database} />
          <ServiceRow label="Pi Bridge" status={bridgeConnected} icon={Wifi} />
        </div>

        {/* Separator */}
        <div className="border-t" />

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold">{health.network_latency_ms}<span className="text-xs font-normal text-muted-foreground">ms</span></p>
            <p className="text-[10px] text-muted-foreground">Latency</p>
          </div>
          <div>
            <p className={cn("text-lg font-bold", health.errors_last_hour > 0 ? "text-red-500" : "")}>
              {health.errors_last_hour}
            </p>
            <p className="text-[10px] text-muted-foreground">Errors/hr</p>
          </div>
          <div>
            <p className={cn("text-lg font-bold", health.warnings_last_hour > 5 ? "text-amber-500" : "")}>
              {health.warnings_last_hour}
            </p>
            <p className="text-[10px] text-muted-foreground">Warnings/hr</p>
          </div>
        </div>

        {/* Active connections */}
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Active Connections</span>
          <span className="font-medium">{health.active_connections}</span>
        </div>
      </CardContent>
    </Card>
  );
}
