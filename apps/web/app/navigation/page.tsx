/**
 * Navigation mode hub — pick Manual or Autonomous (never both).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Gamepad2,
  Navigation,
  LogOut,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { LidarMapPanel } from "@/components/navigation/lidar-map-panel";
import {
  ConnectionBadges,
  EmergencyOverlay,
  EmergencyStopButton,
  ModeSeparationNotice,
  NavStatusCard,
} from "@/components/navigation/nav-shared";
import {
  useNavigationSocket,
  type NavStatusPayload,
} from "@/hooks/use-navigation-socket";
import {
  resetEmergencyStop,
  setNavigationMode,
} from "@/lib/api/navigation";
import { ROBOT_ID } from "@/lib/robot";

export default function NavigationHubPage() {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const robotId = ROBOT_ID;
  const [resetLoading, setResetLoading] = useState(false);
  const [modeLoading, setModeLoading] = useState<"manual" | "autonomous" | "idle" | null>(null);
  const [modeError, setModeError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get("notice");
    if (n) setNotice(n);
  }, []);

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
  const currentSpeed = navStatus?.current_speed ?? 0;
  const heading =
    (navStatus as NavStatusPayload & { heading?: number })?.heading ?? 0;

  const handleResetEmergency = useCallback(async () => {
    setResetLoading(true);
    try {
      await resetEmergencyStop(robotId);
      sendNavCommand("reset_estop", robotId);
    } catch {
      // ignore if already clear
    } finally {
      setResetLoading(false);
    }
  }, [robotId, sendNavCommand]);

  const handleEnter = useCallback(
    async (target: "manual" | "autonomous") => {
      setModeError(null);
      setModeLoading(target);
      try {
        if (mode === target) {
          router.push(`/navigation/${target}`);
          return;
        }
        if (mode !== "idle") {
          setModeError(
            `Exit ${mode === "manual" ? "Manual" : "Autonomous"} first before entering ${target === "manual" ? "Manual" : "Autonomous"}.`,
          );
          return;
        }
        await setNavigationMode(target, robotId);
        router.push(`/navigation/${target}`);
      } catch (err) {
        setModeError(err instanceof Error ? err.message : "Failed to enter mode");
      } finally {
        setModeLoading(null);
      }
    },
    [mode, robotId, router],
  );

  const handleExit = useCallback(async () => {
    setModeError(null);
    setModeLoading("idle");
    try {
      await setNavigationMode("idle", robotId);
      sendNavCommand("stop", robotId);
    } catch (err) {
      setModeError(err instanceof Error ? err.message : "Failed to exit mode");
    } finally {
      setModeLoading(null);
    }
  }, [robotId, sendNavCommand]);

  return (
    <div className="relative space-y-4">
      <EmergencyOverlay
        active={isEmergency}
        resetLoading={resetLoading}
        onReset={handleResetEmergency}
      />

      <PageHeader
        icon={Navigation}
        title="Navigation"
        description="Choose Manual drive or Autonomous Destination — one mode at a time"
        badge={isConnected ? "Live" : undefined}
      />

      <ConnectionBadges
        isConnected={isConnected}
        mode={mode}
        robot={robot}
        bridgeConnected={bridgeConnected}
      />

      <ModeSeparationNotice />

      {(notice || modeError) && (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          {modeError ?? notice}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gamepad2 className="h-4 w-4" />
                  Manual Drive
                </CardTitle>
                <CardDescription className="text-xs">
                  Joystick / WASD → /cmd_vel. No Destination controls.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full"
                  disabled={isEmergency || modeLoading !== null || mode === "autonomous"}
                  onClick={() => handleEnter("manual")}
                >
                  {modeLoading === "manual" ? "Entering…" : "Enter Manual"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                {mode === "autonomous" && (
                  <p className="text-[11px] text-muted-foreground">
                    Exit Autonomous first.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Navigation className="h-4 w-4" />
                  Autonomous
                </CardTitle>
                <CardDescription className="text-xs">
                  Destination → Nav2 NavigateToPose. No joystick.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  className="w-full"
                  disabled={isEmergency || modeLoading !== null || mode === "manual"}
                  onClick={() => handleEnter("autonomous")}
                >
                  {modeLoading === "autonomous" ? "Entering…" : "Enter Autonomous"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                {mode === "manual" && (
                  <p className="text-[11px] text-muted-foreground">
                    Exit Manual first.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {(mode === "manual" || mode === "autonomous") && (
            <Button
              variant="outline"
              className="w-full"
              disabled={modeLoading !== null}
              onClick={handleExit}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {modeLoading === "idle"
                ? "Exiting…"
                : `Exit ${mode === "manual" ? "Manual" : "Autonomous"}`}
            </Button>
          )}

          {!rosPathOnline && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              ROS relay offline — start{" "}
              <code className="text-[10px]">micro_ros_agent</code> +{" "}
              <code className="text-[10px]">ros2_bridge</code> before driving.
            </p>
          )}

          <LidarMapPanel
            mapPoints={mapPoints}
            lidarPoints={lidarPoints}
            lidarFov={lidarFov}
            heading={heading}
            slamMap={slamMap}
            robotPose={robotPose}
            onResetMap={() => sendNavCommand("reset_map", robotId)}
          />
        </div>

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
