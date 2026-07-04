/**
 * Navigation Controls page
 *
 * Layout: Joystick (left) | LIDAR Viz (centre) | Controls (right)
 * Mobile-first responsive — stacks vertically on small screens.
 *
 * Features:
 *   • Manual joystick control via nipplejs
 *   • Real-time LIDAR visualization (Canvas, 10 fps)
 *   • Autonomous mode toggle with floor selector & progress
 *   • Emergency stop overlay with reset
 *   • Speed indicator, connection badge, mode badge
 */
"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Gamepad2,
  Navigation,
  Radio,
  ShieldAlert,
  ShieldCheck,
  StopCircle,
  Wifi,
  WifiOff,
  Gauge,
  MapPin,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Cpu,
} from "lucide-react";
import { Joystick } from "@/components/navigation/joystick";
import { LidarViz } from "@/components/navigation/lidar-viz";
import { PageHeader } from "@/components/ui/page-header";
import {
  useNavigationSocket,
  type NavStatusPayload,
} from "@/hooks/use-navigation-socket";
import {
  startAutonomousNavigation,
  resetEmergencyStop,
  type NavigationCommand,
  type AutonomousResponse,
} from "@/lib/api/navigation";
import { ROBOT_ID, ROBOT_NAME } from "@/lib/robot";
import { cn } from "@/lib/utils";

// ── Mode badge ───────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: string }) {
  const variants: Record<string, "default" | "info" | "success" | "warning" | "destructive"> = {
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

// ── Last command indicator ───────────────────────────────────────────────

function DirectionIndicator({ command }: { command: NavigationCommand | null }) {
  const iconMap: Record<string, React.ReactNode> = {
    forward: <ArrowUp className="h-4 w-4" />,
    backward: <ArrowDown className="h-4 w-4" />,
    left: <ArrowLeft className="h-4 w-4" />,
    right: <ArrowRight className="h-4 w-4" />,
    stop: <StopCircle className="h-4 w-4" />,
  };

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {command ? (
        <>
          {iconMap[command] ?? null}
          <span className="capitalize">{command}</span>
        </>
      ) : (
        <span>—</span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function NavigationPage() {
  const robotId = ROBOT_ID;
  const [lastCommand, setLastCommand] = useState<NavigationCommand | null>(null);
  const [lastSpeed, setLastSpeed] = useState(0);

  // Autonomous state
  const [autoMode, setAutoMode] = useState(false);
  const [targetFloor, setTargetFloor] = useState(2);
  const [targetLocation, setTargetLocation] = useState("");
  const [autoResponse, setAutoResponse] = useState<AutonomousResponse | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  // Emergency reset
  const [resetLoading, setResetLoading] = useState(false);

  // Socket
  const {
    isConnected,
    lidarPoints,
    mapPoints,
    lidarFov,
    navStatus,
    isEmergency,
    robot,
    bridgeConnected,
    sendNavCommand,
  } = useNavigationSocket();
  const esp32Connected = robot?.sensors.esp32_connected ?? false;
  const esp32Port = robot?.sensors.esp32_port ?? "not detected";
  const esp32Connection = robot?.sensors.esp32_connection ?? "serial";
  const mode = navStatus?.mode ?? "idle";
  const isAutonomous = mode === "autonomous" || autoMode;
  const movementDisabled = isEmergency || isAutonomous || !esp32Connected;
  const disabledReason = isEmergency
    ? "Emergency stop active"
    : isAutonomous
      ? "Autonomous mode active"
      : !esp32Connected
        ? "ESP32 link missing"
        : "Joystick disabled";

  // ── Joystick command handler ──────────────────────────────────────────

  const handleJoystickCommand = useCallback(
    (command: NavigationCommand, speed: number) => {
      if (command !== "stop" && movementDisabled) return;
      setLastCommand(command);
      setLastSpeed(speed);
      sendNavCommand(command, robotId, { speed });
    },
    [movementDisabled, robotId, sendNavCommand],
  );

  // ── Keyboard controls ─────────────────────────────────────────────────

  useEffect(() => {
    const keyMap: Record<string, NavigationCommand> = {
      ArrowUp: "forward",
      ArrowDown: "backward",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "forward",
      s: "backward",
      a: "left",
      d: "right",
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const cmd = keyMap[e.key];
      if (cmd && !isEmergency && !isAutonomous) {
        e.preventDefault();
        handleJoystickCommand(cmd, 0.5);
      }
      if (e.key === " ") {
        e.preventDefault();
        handleJoystickCommand("stop", 0);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (keyMap[e.key]) {
        handleJoystickCommand("stop", 0);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleJoystickCommand, isEmergency, isAutonomous]);

  // ── Autonomous navigation ──────────────────────────────────────────────

  const handleStartAutonomous = useCallback(async () => {
    setAutoLoading(true);
    setAutoError(null);
    try {
      const resp = await startAutonomousNavigation({
        robot_id: robotId,
        target_floor: targetFloor,
        target_location: targetLocation || undefined,
      });
      setAutoResponse(resp);
      setAutoMode(true);
      sendNavCommand("autonomous", robotId, {
        target_floor: targetFloor,
        targetFloor: targetFloor,
        target_location: targetLocation || undefined,
        targetLocation: targetLocation || undefined,
        eta_seconds: resp.eta_seconds,
        etaSeconds: resp.eta_seconds,
        speed: 0.7,
      });
    } catch (err) {
      setAutoMode(false);
      setAutoError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setAutoLoading(false);
    }
  }, [robotId, targetFloor, targetLocation, sendNavCommand]);

  const handleStopAutonomous = useCallback(() => {
    setAutoMode(false);
    setAutoResponse(null);
    sendNavCommand("stop", robotId);
  }, [robotId, sendNavCommand]);

  // ── Emergency reset ────────────────────────────────────────────────────

  const handleResetEmergency = useCallback(async () => {
    setResetLoading(true);
    try {
      await resetEmergencyStop(robotId);
      sendNavCommand("reset_estop", robotId);
    } catch {
      // API might throw if already reset — ignore
    } finally {
      setResetLoading(false);
    }
  }, [robotId, sendNavCommand]);

  // ── Compute display values ─────────────────────────────────────────────

  const progress = navStatus?.progress ?? 0;
  const eta = navStatus?.eta_seconds ?? autoResponse?.eta_seconds ?? null;
  const currentSpeed = navStatus?.current_speed ?? lastSpeed;
  const heading = (navStatus as NavStatusPayload & { heading?: number })?.heading ?? 0;

  return (
    <div className="relative space-y-4">
      {/* ── Emergency Overlay ──────────────────────────────────────── */}
      {isEmergency && (
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
                onClick={handleResetEmergency}
                disabled={resetLoading}
              >
                <RotateCcw className={cn("mr-2 h-4 w-4", resetLoading && "animate-spin")} />
                {resetLoading ? "Resetting…" : "Reset Emergency Stop"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
      <PageHeader
        icon={Navigation}
        title="Navigation Controls"
        description="Manual joystick, autonomous navigation, and LIDAR visualization"
        badge={isConnected ? "Live" : undefined}
      />
      {/* ── Header Row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="text-xs">
          {ROBOT_NAME}
        </Badge>

        <div className="flex items-center gap-2">
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
          {esp32Connected ? (
            <Badge variant="success" className="gap-1">
              <Cpu className="h-3 w-3" />
              ESP32 Ready
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <Cpu className="h-3 w-3" />
              ESP32 Missing
            </Badge>
          )}
        </div>
      </div>

      {/* ── Main 3-Column Layout ───────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr_300px]">
        {/* ── LEFT: Joystick & Manual Controls ─────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gamepad2 className="h-4 w-4" />
                Manual Control
              </CardTitle>
              <CardDescription className="text-xs">
                Use joystick or arrow keys (WASD)
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <Joystick
                onCommand={handleJoystickCommand}
                size={180}
                disabled={movementDisabled}
                disabledLabel={disabledReason}
              />

              <div className="flex w-full items-center justify-between text-xs">
                <span className="text-muted-foreground">Last command:</span>
                <DirectionIndicator command={lastCommand} />
              </div>

              <div className="flex w-full items-center justify-between text-xs">
                <span className="text-muted-foreground">Speed:</span>
                <div className="flex items-center gap-1">
                  <Gauge className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono">
                    {currentSpeed.toFixed(2)} m/s
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Direction buttons */}
          <div className="grid grid-cols-3 gap-1.5">
            <div />
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={movementDisabled}
              onClick={() => handleJoystickCommand("forward", 0.5)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div />
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={movementDisabled}
              onClick={() => handleJoystickCommand("left", 0.5)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={isEmergency}
              onClick={() => handleJoystickCommand("stop", 0)}
            >
              <StopCircle className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={movementDisabled}
              onClick={() => handleJoystickCommand("right", 0.5)}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div />
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={movementDisabled}
              onClick={() => handleJoystickCommand("backward", 0.5)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <div />
          </div>

          {/* Servo buttons */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Servo Sweeps</CardTitle>
              <CardDescription className="text-xs">
                ESP32 commands u/d/v/e
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={movementDisabled}
                onClick={() => sendNavCommand("front_servo_up", robotId)}
              >
                Front Up
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={movementDisabled}
                onClick={() => sendNavCommand("front_servo_down", robotId)}
              >
                Front Down
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={movementDisabled}
                onClick={() => sendNavCommand("rear_servo_up", robotId)}
              >
                Rear Up
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={movementDisabled}
                onClick={() => sendNavCommand("rear_servo_down", robotId)}
              >
                Rear Down
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── CENTRE: LIDAR Visualization ──────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4" />
              LIDAR Visualization
            </CardTitle>
            <CardDescription className="text-xs">
              Real-time 2D map • {(mapPoints.length || lidarPoints.length)} points • {lidarFov}° FOV
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 items-center justify-center p-4">
            <LidarViz
              points={mapPoints.length ? mapPoints : lidarPoints}
              fov={lidarFov}
              heading={heading}
              path={
                autoResponse?.path
                  ? autoResponse.path.map((w) => ({ x: w.x / 20 - 2.5, y: w.y / 20 - 2.5 }))
                  : undefined
              }
              size={360}
              maxRange={6}
            />
          </CardContent>
          <div className="border-t px-4 pb-4">
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => sendNavCommand("reset_map", robotId)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset Map
            </Button>
          </div>
        </Card>

        {/* ── RIGHT: Autonomous Controls & Status ──────────────────── */}
        <div className="space-y-4">
          {/* Autonomous navigation card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Navigation className="h-4 w-4" />
                Autonomous Mode
              </CardTitle>
              <CardDescription className="text-xs">
                Navigate to a floor automatically
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs w-16">Floor</Label>
                <Select
                  value={String(targetFloor)}
                  onChange={(e) => setTargetFloor(Number(e.target.value))}
                  className="h-8 text-xs"
                  disabled={isAutonomous}
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={i}>
                      Floor {i}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs w-16">Room</Label>
                <input
                  type="text"
                  value={targetLocation}
                  onChange={(e) => setTargetLocation(e.target.value)}
                  placeholder="Optional room"
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  disabled={isAutonomous}
                />
              </div>

              {autoError && (
                <p className="text-xs text-destructive">{autoError}</p>
              )}

              {!isAutonomous ? (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleStartAutonomous}
                  disabled={isEmergency || autoLoading || !esp32Connected}
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  {autoLoading ? "Starting…" : "Start Navigation"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full"
                  onClick={handleStopAutonomous}
                >
                  <StopCircle className="mr-2 h-4 w-4" />
                  Cancel Navigation
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Progress card (visible during autonomous) */}
          {isAutonomous && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Navigation Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-mono font-medium">
                      {Math.round(progress * 100)}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                </div>

                {eta !== null && eta > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">ETA</span>
                    <span className="font-mono">
                      {Math.floor(eta / 60)}m {eta % 60}s
                    </span>
                  </div>
                )}

                {autoResponse?.path && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Waypoints</span>
                    <span className="font-mono">
                      {autoResponse.path.length}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Target</span>
                  <span>
                    Floor {targetFloor}
                    {targetLocation ? ` — ${targetLocation}` : ""}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status card */}
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
                <span className="text-muted-foreground">Pi Bridge</span>
                {bridgeConnected ? (
                  <Badge variant="success" className="text-[10px]">
                    LIVE
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-[10px]">
                    OFFLINE
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">ESP32 Link</span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <Badge
                    variant={esp32Connected ? "success" : "destructive"}
                    className="text-[10px]"
                  >
                    {esp32Connected ? "READY" : "MISSING"}
                  </Badge>
                  <span className="truncate font-mono text-muted-foreground">
                    {esp32Connection}:{esp32Port}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Emergency Stop Button */}
          <Button
            variant="destructive"
            size="lg"
            className="w-full min-h-[52px] text-base font-bold"
            onClick={() => sendNavCommand("emergency_stop", robotId)}
            disabled={isEmergency}
          >
            <ShieldAlert className="mr-2 h-5 w-5" />
            {isEmergency ? "EMERGENCY ACTIVE" : "EMERGENCY STOP"}
          </Button>
        </div>
      </div>
    </div>
  );
}
