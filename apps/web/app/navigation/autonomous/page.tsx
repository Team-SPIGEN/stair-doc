/**
 * Autonomous navigation — Destination + Start/Stop. No joystick.
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
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  LogOut,
  MapPin,
  Navigation,
  StopCircle,
} from "lucide-react";
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
  fetchLocations,
  resetEmergencyStop,
  setNavigationMode,
  startAutonomousNavigation,
  type AutonomousResponse,
  type LocationRoom,
} from "@/lib/api/navigation";
import { ROBOT_ID } from "@/lib/robot";

export default function AutonomousNavigationPage() {
  const router = useRouter();
  const robotId = ROBOT_ID;
  const leavingRef = useRef(false);
  const [targetFloor] = useState(0);
  const [targetLocation, setTargetLocation] = useState("");
  const [autoResponse, setAutoResponse] = useState<AutonomousResponse | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoSuccess, setAutoSuccess] = useState<string | null>(null);
  const [knownRooms, setKnownRooms] = useState<LocationRoom[]>([]);
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
  const hasActiveGoal = mode === "autonomous" && Boolean(navStatus?.target_location);
  const rosPathOnline = bridgeConnected;
  const ros2Ready = robot?.sensors.ros2_ready ?? false;
  const nav2Ready = robot?.sensors.nav2_ready ?? false;
  const microRosOk = robot?.sensors.micro_ros_agent ?? false;
  const amclReady = robot?.sensors.amcl_ready ?? Boolean(robotPose);
  const currentSpeed = navStatus?.current_speed ?? 0;
  const heading =
    (navStatus as NavStatusPayload & { heading?: number })?.heading ?? 0;
  const progress = navStatus?.progress ?? 0;
  const eta = navStatus?.eta_seconds ?? autoResponse?.eta_seconds ?? null;

  useEffect(() => {
    if (leavingRef.current) return;
    if (mode === "manual") {
      router.replace(
        "/navigation?notice=" +
          encodeURIComponent("Exit Manual first before Autonomous navigation."),
      );
      return;
    }
    if (mode === "idle" && !isEmergency) {
      setNavigationMode("autonomous", robotId).catch(() => undefined);
    }
  }, [mode, isEmergency, robotId, router]);

  useEffect(() => {
    fetchLocations()
      .then((data) => setKnownRooms(data.rooms ?? []))
      .catch(() => setKnownRooms([]));
  }, []);

  const destinationTrimmed = targetLocation.trim().replace(/\s+/g, " ");
  const canStartAutonomous =
    !isEmergency &&
    !autoLoading &&
    rosPathOnline &&
    destinationTrimmed.length > 0 &&
    mode !== "manual" &&
    !hasActiveGoal;

  const handleStartAutonomous = useCallback(async () => {
    const destination = targetLocation.trim().replace(/\s+/g, " ");
    if (!destination) {
      setAutoError("Destination is required.");
      return;
    }
    if (!rosPathOnline) {
      setAutoError(
        "Pi ROS bridge offline. Start ros2_bridge with micro_ros_agent + Nav2.",
      );
      return;
    }

    setAutoLoading(true);
    setAutoError(null);
    setAutoSuccess(null);
    try {
      const resp = await startAutonomousNavigation({
        robot_id: robotId,
        target_floor: targetFloor,
        target_location: destination,
      });
      setAutoResponse(resp);
      setAutoSuccess(
        resp.message ||
          (resp.goal
            ? `Nav2 goal → ${resp.goal.room_id} (${resp.goal.x.toFixed(2)}, ${resp.goal.y.toFixed(2)})`
            : "Navigation started"),
      );
    } catch (err) {
      setAutoResponse(null);
      setAutoError(err instanceof Error ? err.message : "Failed to start");
    } finally {
      setAutoLoading(false);
    }
  }, [robotId, targetFloor, targetLocation, rosPathOnline]);

  const handleStopAutonomous = useCallback(() => {
    setAutoResponse(null);
    setAutoSuccess(null);
    sendNavCommand("stop", robotId);
  }, [robotId, sendNavCommand]);

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
        icon={Navigation}
        title="Autonomous"
        description="Destination → Nav2. Exit before Manual drive."
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
          {exitLoading ? "Exiting…" : "Exit Autonomous"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr_280px]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Navigation className="h-4 w-4" />
                Destination
              </CardTitle>
              <CardDescription className="text-xs">
                Navigate to a room on the current map.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Label className="w-20 text-xs">Floor</Label>
                <Select
                  value={String(targetFloor)}
                  className="h-8 text-xs opacity-60"
                  disabled
                  aria-disabled
                >
                  <option value="0">Coming soon</option>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Label className="w-20 text-xs" htmlFor="destination-input">
                    Destination
                  </Label>
                  <input
                    id="destination-input"
                    type="text"
                    list="destination-rooms"
                    value={targetLocation}
                    onChange={(e) => {
                      setTargetLocation(e.target.value);
                      setAutoError(null);
                      setAutoSuccess(null);
                    }}
                    placeholder="e.g. IDS Lab"
                    required
                    className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={hasActiveGoal}
                  />
                  <datalist id="destination-rooms">
                    {knownRooms.map((room) => (
                      <option key={room.id} value={room.aliases[0] ?? room.id}>
                        {room.id}
                      </option>
                    ))}
                  </datalist>
                </div>
                {knownRooms.length > 0 && (
                  <p className="pl-[5.5rem] text-[10px] text-muted-foreground">
                    Known: {knownRooms.map((r) => r.aliases[0] ?? r.id).join(", ")}
                  </p>
                )}
              </div>

              {!rosPathOnline && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Pi ROS bridge offline — Start Navigation disabled.
                </p>
              )}
              {rosPathOnline && !amclReady && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  AMCL / pose not received yet — localization may still be starting.
                </p>
              )}

              {autoError && (
                <p className="text-xs text-destructive">{autoError}</p>
              )}
              {autoSuccess && !autoError && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {autoSuccess}
                </p>
              )}

              {!hasActiveGoal ? (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={handleStartAutonomous}
                  disabled={!canStartAutonomous}
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

          {hasActiveGoal && (
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

                {autoResponse?.goal && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Goal</span>
                    <span className="font-mono">
                      ({autoResponse.goal.x.toFixed(2)},{" "}
                      {autoResponse.goal.y.toFixed(2)})
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Target</span>
                  <span className="truncate">
                    {autoResponse?.goal?.room_id ??
                      navStatus?.target_location ??
                      targetLocation}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <LidarMapPanel
          mapPoints={mapPoints}
          lidarPoints={lidarPoints}
          lidarFov={lidarFov}
          heading={heading}
          path={
            autoResponse?.path
              ? autoResponse.path.map((w) => ({ x: w.x, y: w.y }))
              : undefined
          }
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
