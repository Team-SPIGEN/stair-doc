"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Cpu,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  WifiOff,
  RotateCcw,
} from "lucide-react";
import { ROBOT_NAME } from "@/lib/robot";
import { cn } from "@/lib/utils";
import type { RobotStatusResponse } from "@/lib/api/robot-status";

export function ModeBadge({ mode }: { mode: string }) {
  const variants: Record<
    string,
    "default" | "info" | "success" | "warning" | "destructive"
  > = {
    idle: "default",
    manual: "info",
    autonomous: "success",
    emergency: "destructive",
  };
  return (
    <Badge variant={variants[mode] ?? "default"} className="capitalize">
      {mode}
    </Badge>
  );
}

export function ModeSeparationNotice() {
  return (
    <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      Manual and Autonomous cannot run together. Exit one mode before entering
      the other.
    </p>
  );
}

type ConnectionBadgesProps = {
  isConnected: boolean;
  mode: string;
  robot?: RobotStatusResponse | null;
  bridgeConnected: boolean;
};

export function ConnectionBadges({
  isConnected,
  mode,
  robot,
  bridgeConnected,
}: ConnectionBadgesProps) {
  const esp32Connected = robot?.sensors.esp32_connected ?? false;
  const microRosOk = robot?.sensors.micro_ros_agent ?? false;
  const rosPathOnline = bridgeConnected;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant="outline" className="text-xs">
        {ROBOT_NAME}
      </Badge>
      <div className="flex flex-wrap items-center gap-2">
        {isConnected ? (
          <Badge variant="success" className="gap-1">
            <Wifi className="h-3 w-3" />
            Connected
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <WifiOff className="h-3 w-3" />
            Offline
          </Badge>
        )}
        <ModeBadge mode={mode} />
        {esp32Connected || microRosOk || rosPathOnline ? (
          <Badge variant="success" className="gap-1">
            <Cpu className="h-3 w-3" />
            micro-ROS
          </Badge>
        ) : (
          <Badge variant="destructive" className="gap-1">
            <Cpu className="h-3 w-3" />
            ROS Offline
          </Badge>
        )}
      </div>
    </div>
  );
}

type StatusCardProps = {
  mode: string;
  currentSpeed: number;
  isEmergency: boolean;
  heading: number;
  rosPathOnline: boolean;
  ros2Ready: boolean;
  nav2Ready: boolean;
  microRosOk: boolean;
  esp32Connection?: string;
  amclReady: boolean;
};

export function NavStatusCard({
  mode,
  currentSpeed,
  isEmergency,
  heading,
  rosPathOnline,
  ros2Ready,
  nav2Ready,
  microRosOk,
  esp32Connection,
  amclReady,
}: StatusCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4" />
          Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Mode</span>
          <ModeBadge mode={mode} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Speed</span>
          <span className="font-mono">{currentSpeed.toFixed(2)} m/s</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Emergency</span>
          {isEmergency ? (
            <Badge variant="destructive" className="text-[10px]">
              ACTIVE
            </Badge>
          ) : (
            <Badge variant="success" className="text-[10px]">
              CLEAR
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Heading</span>
          <span className="font-mono">{heading.toFixed(0)}°</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">ROS /cmd_vel</span>
          {rosPathOnline ? (
            <Badge variant="success" className="text-[10px]">
              {ros2Ready || nav2Ready ? "LIVE" : "RELAY"}
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-[10px]">
              OFFLINE
            </Badge>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">micro-ROS agent</span>
          <Badge
            variant={
              microRosOk || esp32Connection === "micro-ros"
                ? "success"
                : "destructive"
            }
            className="text-[10px]"
          >
            {microRosOk || esp32Connection === "micro-ros" ? "UP" : "DOWN"}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">AMCL</span>
          <Badge variant={amclReady ? "success" : "default"} className="text-[10px]">
            {amclReady ? "READY" : "WAITING"}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-muted-foreground">ESP owner</span>
          <span className="truncate font-mono text-muted-foreground">
            micro_ros_agent
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

type EmergencyOverlayProps = {
  active: boolean;
  resetLoading: boolean;
  onReset: () => void;
};

export function EmergencyOverlay({
  active,
  resetLoading,
  onReset,
}: EmergencyOverlayProps) {
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-red-950/80 backdrop-blur-sm">
      <Card className="w-full max-w-sm border-red-500 bg-red-950/90">
        <CardContent className="flex flex-col items-center gap-6 p-8">
          <ShieldAlert className="h-16 w-16 animate-pulse text-red-400" />
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-200">
              EMERGENCY STOP ACTIVE
            </h2>
            <p className="mt-2 text-sm text-red-300/80">
              All robot movement has been halted. Reset to resume operations.
            </p>
          </div>
          <Button
            variant="outline"
            size="lg"
            className="border-red-500 text-red-200 hover:bg-red-900"
            onClick={onReset}
            disabled={resetLoading}
          >
            <RotateCcw
              className={cn("mr-2 h-4 w-4", resetLoading && "animate-spin")}
            />
            {resetLoading ? "Resetting…" : "Reset Emergency Stop"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

type EmergencyStopButtonProps = {
  isEmergency: boolean;
  onClick: () => void;
};

export function EmergencyStopButton({
  isEmergency,
  onClick,
}: EmergencyStopButtonProps) {
  return (
    <Button
      variant="destructive"
      size="lg"
      className="w-full min-h-[52px] text-base font-bold"
      onClick={onClick}
      disabled={isEmergency}
    >
      <ShieldAlert className="mr-2 h-5 w-5" />
      {isEmergency ? "EMERGENCY ACTIVE" : "EMERGENCY STOP"}
    </Button>
  );
}
