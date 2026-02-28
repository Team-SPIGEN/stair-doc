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
} from "lucide-react";
import { Joystick } from "@/components/navigation/joystick";
import { LidarViz } from "@/components/navigation/lidar-viz";
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
import { cn } from "@/lib/utils";

// ── Robot list (mock) ────────────────────────────────────────────────────

const ROBOTS = [
  { id: "robot-001", name: "StairBot Alpha" },
  { id: "robot-002", name: "StairBot Beta" },
  { id: "robot-003", name: "StairBot Gamma" },
  { id: "robot-004", name: "StairBot Delta" },
];

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
  const [robotId, setRobotId] = useState("robot-001");
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
    lidarFov,
    navStatus,
    isEmergency,
    sendNavCommand,
  } = useNavigationSocket();

  // ── Joystick command handler ──────────────────────────────────────────

  const handleJoystickCommand = useCallback(
    (command: NavigationCommand, speed: number) => {
      setLastCommand(command);
      setLastSpeed(speed);
      sendNavCommand(command, robotId, { speed });
    },
    [robotId, sendNavCommand],
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
      if (cmd && !isEmergency && !autoMode) {
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
  }, [handleJoystickCommand, isEmergency, autoMode]);

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
      sendNavCommand("autonomous", robotId, { target_floor: targetFloor });
    } catch (err) {
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

  const mode = navStatus?.mode ?? "idle";
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

      {/* ── Header Row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Robot</Label>
          <Select
            value={robotId}
            onChange={(e) => setRobotId(e.target.value)}
            className="h-8 w-44 text-xs"
          >
            {ROBOTS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>

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
                disabled={isEmergency || autoMode}
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

          {/* Quick buttons for mobile */}
          <div className="grid grid-cols-3 gap-1.5 lg:hidden">
            <div />
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={isEmergency || autoMode}
              onClick={() => handleJoystickCommand("forward", 0.5)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <div />
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={isEmergency || autoMode}
              onClick={() => handleJoystickCommand("left", 0.5)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={isEmergency || autoMode}
              onClick={() => handleJoystickCommand("stop", 0)}
            >
              <StopCircle className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={isEmergency || autoMode}
              onClick={() => handleJoystickCommand("right", 0.5)}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <div />
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={isEmergency || autoMode}
              onClick={() => handleJoystickCommand("backward", 0.5)}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
            <div />
          </div>
        </div>

        {/* ── CENTRE: LIDAR Visualization ──────────────────────────── */}
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="h-4 w-4" />
              LIDAR Visualization
            </CardTitle>
            <CardDescription className="text-xs">
              Real-time 2D point cloud • {lidarPoints.length} points • {lidarFov}° FOV
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 items-center justify-center p-4">
            <LidarViz
              points={lidarPoints}
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
                  disabled={autoMode}
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
                  disabled={autoMode}
                />
              </div>

              {autoError && (
                <p className="text-xs text-destructive">{autoError}</p>
              )}

              {!autoMode ? (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setAutoMode(true);
                    handleStartAutonomous();
                  }}
                  disabled={isEmergency || autoLoading}
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
          {autoMode && (
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
