/**
 * Manual drive — joystick / WASD only. No Destination controls.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Gamepad2,
  Gauge,
  LogOut,
  StopCircle,
} from "lucide-react";
import { Joystick } from "@/components/navigation/joystick";
import { LidarMapPanel } from "@/components/navigation/lidar-map-panel";
import {
  ConnectionBadges,
  EmergencyOverlay,
  EmergencyStopButton,
  ModeSeparationNotice,
  NavStatusCard,
} from "@/components/navigation/nav-shared";
import { PageHeader } from "@/components/ui/page-header";
import {
  useNavigationSocket,
  type NavStatusPayload,
} from "@/hooks/use-navigation-socket";
import {
  resetEmergencyStop,
  setNavigationMode,
  type NavigationCommand,
} from "@/lib/api/navigation";
import { ROBOT_ID } from "@/lib/robot";

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

export default function ManualNavigationPage() {
  const router = useRouter();
  const robotId = ROBOT_ID;
  const leavingRef = useRef(false);
  const [lastCommand, setLastCommand] = useState<NavigationCommand | null>(null);
  const [lastSpeed, setLastSpeed] = useState(0);
  const [maxSpeed, setMaxSpeed] = useState(0.5);
  const [resetLoading, setResetLoading] = useState(false);
  const [exitLoading, setExitLoading] = useState(false);

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
    slamMap,
    robotPose,
  } = useNavigationSocket();

  const mode = navStatus?.mode ?? "idle";
  const rosPathOnline = bridgeConnected;
  const ros2Ready = robot?.sensors.ros2_ready ?? false;
  const nav2Ready = robot?.sensors.nav2_ready ?? false;
  const microRosOk = robot?.sensors.micro_ros_agent ?? false;
  const amclReady = robot?.sensors.amcl_ready ?? Boolean(robotPose);
  const currentSpeed = navStatus?.current_speed ?? lastSpeed;
  const heading =
    (navStatus as NavStatusPayload & { heading?: number })?.heading ?? 0;

  useEffect(() => {
    if (leavingRef.current) return;
    if (mode === "autonomous") {
      router.replace(
        "/navigation?notice=" +
          encodeURIComponent("Exit Autonomous first before Manual drive."),
      );
      return;
    }
    if (mode === "idle" && !isEmergency) {
      setNavigationMode("manual", robotId).catch(() => undefined);
    }
  }, [mode, isEmergency, robotId, router]);

  const movementDisabled = isEmergency || mode === "autonomous" || !rosPathOnline;
  const disabledReason = isEmergency
    ? "Emergency stop active"
    : mode === "autonomous"
      ? "Autonomous mode active"
      : !rosPathOnline
        ? "ROS relay offline — start micro_ros_agent + ros2_bridge"
        : "Joystick disabled";

  const handleJoystickCommand = useCallback(
    (command: NavigationCommand, speed: number) => {
      if (command !== "stop" && movementDisabled) return;
      const scaled = command === "stop" ? 0 : Math.min(speed, maxSpeed);
      setLastCommand(command);
      setLastSpeed(scaled);
      sendNavCommand(command, robotId, { speed: scaled });
    },
    [movementDisabled, robotId, sendNavCommand, maxSpeed],
  );

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
      if (e.repeat) return;
      const cmd = keyMap[e.key];
      if (cmd && !isEmergency && mode !== "autonomous") {
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
  }, [handleJoystickCommand, isEmergency, mode]);

  const handleResetEmergency = useCallback(async () => {
    setResetLoading(true);
    try {
      await resetEmergencyStop(robotId);
      sendNavCommand("reset_estop", robotId);
    } catch {
      // ignore
    } finally {
      setResetLoading(false);
    }
  }, [robotId, sendNavCommand]);

  const handleExit = useCallback(async () => {
    leavingRef.current = true;
    setExitLoading(true);
    try {
      sendNavCommand("stop", robotId);
      await setNavigationMode("idle", robotId);
      router.push("/navigation");
    } catch {
      router.push("/navigation");
    } finally {
      setExitLoading(false);
    }
  }, [robotId, sendNavCommand, router]);

  return (
    <div className="relative space-y-4">
      <EmergencyOverlay
        active={isEmergency}
        resetLoading={resetLoading}
        onReset={handleResetEmergency}
      />

      <PageHeader
        icon={Gamepad2}
        title="Manual Drive"
        description="Joystick / WASD → /cmd_vel. Exit before Autonomous."
        badge={isConnected ? "Live" : undefined}
      />

      <ConnectionBadges
        isConnected={isConnected}
        mode={mode}
        robot={robot}
        bridgeConnected={bridgeConnected}
      />

      <ModeSeparationNotice />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/navigation">← Hub</Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={exitLoading}
          onClick={handleExit}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" />
          {exitLoading ? "Exiting…" : "Exit Manual"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr_280px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Gamepad2 className="h-4 w-4" />
                Manual Control
              </CardTitle>
              <CardDescription className="text-xs">
                Joystick / WASD → ROS /cmd_vel via micro_ros_agent.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <Joystick
                onCommand={handleJoystickCommand}
                size={180}
                disabled={movementDisabled}
                disabledLabel={disabledReason}
              />

              <div className="w-full space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Max speed</span>
                  <span className="font-mono">{maxSpeed.toFixed(2)} m/s</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={maxSpeed}
                  onChange={(e) => setMaxSpeed(Number(e.target.value))}
                  disabled={movementDisabled}
                  className="w-full accent-primary"
                  aria-label="Max drive speed"
                />
              </div>

              {!rosPathOnline && (
                <p className="w-full text-xs text-amber-600 dark:text-amber-400">
                  ROS relay offline — Manual disabled.
                </p>
              )}

              <div className="flex w-full items-center justify-between text-xs">
                <span className="text-muted-foreground">Last command:</span>
                <DirectionIndicator command={lastCommand} />
              </div>

              <div className="flex w-full items-center justify-between text-xs">
                <span className="text-muted-foreground">Speed:</span>
                <div className="flex items-center gap-1">
                  <Gauge className="h-3 w-3 text-muted-foreground" />
                  <span className="font-mono">{currentSpeed.toFixed(2)} m/s</span>
                </div>
              </div>
            </CardContent>
          </Card>

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
        </div>

        <LidarMapPanel
          mapPoints={mapPoints}
          lidarPoints={lidarPoints}
          lidarFov={lidarFov}
          heading={heading}
          slamMap={slamMap}
          robotPose={robotPose}
          onResetMap={() => sendNavCommand("reset_map", robotId)}
        />

        <div className="space-y-4">
          <NavStatusCard
            mode={mode}
            currentSpeed={currentSpeed}
            isEmergency={isEmergency}
            heading={heading}
            rosPathOnline={rosPathOnline}
            ros2Ready={ros2Ready}
            nav2Ready={nav2Ready}
            microRosOk={microRosOk}
            esp32Connection={robot?.sensors.esp32_connection ?? undefined}
            amclReady={amclReady}
          />
          <EmergencyStopButton
            isEmergency={isEmergency}
            onClick={() => sendNavCommand("emergency_stop", robotId)}
          />
        </div>
      </div>
    </div>
  );
}
