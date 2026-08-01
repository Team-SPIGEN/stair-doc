/**
 * useNavigationSocket — React hook for real-time navigation telemetry.
 *
 * Subscribes to `lidar_scan`, `nav_status`, `emergency_active`, and
 * `command_ack` Socket.IO events. Provides `sendNavCommand()` to emit
 * `navigation_command` events back to the server.
 *
 * @example
 * ```tsx
 * const { lidarPoints, navStatus, isEmergency, sendNavCommand } =
 *   useNavigationSocket();
 * ```
 */
"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket } from "@/lib/socket/client";
import type { NavigationMode } from "@/lib/api/navigation";
import type { RobotStatusResponse } from "@/lib/api/robot-status";
import type {
  BridgeStatusPayload,
  SystemHealthPayload,
} from "@/hooks/use-robot-socket";

// ── Socket event payload types ──────────────────────────────────────────

export interface LidarPoint {
  angle: number;
  distance: number;
}

export interface LidarScanPayload {
  robot_id: string;
  points: LidarPoint[];
  scan_id?: number;
  fov_degrees?: number;
  fov?: number;
  timestamp: string;
}

export interface NavStatusPayload {
  robot_id: string;
  mode: NavigationMode;
  target_floor: number | null;
  target_location: string | null;
  progress: number;
  eta_seconds: number | null;
  current_speed: number;
  emergency_active: boolean;
  heading: number;
  timestamp: string;
}

export interface EmergencyActivePayload {
  robot_id: string;
  active?: boolean;
  activated_at?: string;
  message?: string;
  timestamp?: string;
}

export interface CommandAckPayload {
  action: string;
  robot_id: string | null;
  status: "accepted" | "rejected";
  timestamp: string;
}

export interface RobotTelemetryPayload {
  robots: RobotStatusResponse[];
  total: number;
  timestamp: string;
}

// ── SLAM map types ──────────────────────────────────────────────────────

export interface SlamMapPoint {
  x: number;
  y: number;
}

export interface SlamMapData {
  /** OccupancyGrid width in cells */
  width: number;
  /** OccupancyGrid height in cells */
  height: number;
  /** Metres per cell */
  resolution: number;
  /** World-frame origin of grid (metres) */
  origin_x: number;
  origin_y: number;
  /** Downsampled world-frame obstacle points */
  map_points?: SlamMapPoint[];
  /** Current /scan in robot frame ({angle, distance}) */
  obstacle_points?: LidarPoint[];
  /** "mapping" | "localization" */
  slam_mode?: string;
  /** True when the server cleared the map */
  cleared?: boolean;
  timestamp?: string;
}

export interface RobotPosePayload {
  robot_id: string;
  x: number;
  y: number;
  heading: number;
  timestamp: string;
}

// ── Hook options ────────────────────────────────────────────────────────

interface UseNavigationSocketOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Callback on LIDAR scan */
  onLidarScan?: (data: LidarScanPayload) => void;
  /** Callback on nav status update */
  onNavStatus?: (data: NavStatusPayload) => void;
  /** Callback on emergency activation */
  onEmergencyActive?: (data: EmergencyActivePayload) => void;
  /** Callback on command acknowledgment */
  onCommandAck?: (data: CommandAckPayload) => void;
}

interface UseNavigationSocketReturn {
  /** Whether the socket is currently connected */
  isConnected: boolean;
  /** Latest LIDAR scan points */
  lidarPoints: LidarPoint[];
  /** Accumulated map points from manual exploration */
  mapPoints: LidarPoint[];
  /** LIDAR field of view in degrees */
  lidarFov: number;
  /** Latest navigation status */
  navStatus: NavStatusPayload | null;
  /** Whether emergency stop is active */
  isEmergency: boolean;
  /** Latest robot telemetry for hardware-link status */
  robot: RobotStatusResponse | null;
  /** Whether the Raspberry Pi bridge is registered with the API */
  bridgeConnected: boolean;
  /** Latest Raspberry Pi bridge status */
  bridgeStatus: BridgeStatusPayload | null;
  /** Latest SLAM OccupancyGrid snapshot (null if not streaming) */
  slamMap: SlamMapData | null;
  /** Robot world-frame pose from /amcl_pose or /odom (null if not streaming) */
  robotPose: { x: number; y: number; heading: number } | null;
  /** Send a navigation command via Socket.IO */
  sendNavCommand: (
    action: string,
    robotId?: string,
    params?: Record<string, unknown>,
  ) => void;
}

// ── Hook implementation ─────────────────────────────────────────────────

export function useNavigationSocket(
  options: UseNavigationSocketOptions = {},
): UseNavigationSocketReturn {
  const {
    autoConnect = true,
    onLidarScan,
    onNavStatus,
    onEmergencyActive,
    onCommandAck,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lidarPoints, setLidarPoints] = useState<LidarPoint[]>([]);
  const [mapPoints, setMapPoints] = useState<LidarPoint[]>([]);
  const [lidarFov, setLidarFov] = useState(270);
  const [navStatus, setNavStatus] = useState<NavStatusPayload | null>(null);
  const [isEmergency, setIsEmergency] = useState(false);
  const [robot, setRobot] = useState<RobotStatusResponse | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatusPayload | null>(null);
  const [slamMap, setSlamMap] = useState<SlamMapData | null>(null);
  const [robotPose, setRobotPose] = useState<{ x: number; y: number; heading: number } | null>(null);

  // Stable callback refs
  const onLidarScanRef = useRef(onLidarScan);
  const onNavStatusRef = useRef(onNavStatus);
  const onEmergencyActiveRef = useRef(onEmergencyActive);
  const onCommandAckRef = useRef(onCommandAck);

  useEffect(() => {
    onLidarScanRef.current = onLidarScan;
  }, [onLidarScan]);

  useEffect(() => {
    onNavStatusRef.current = onNavStatus;
  }, [onNavStatus]);

  useEffect(() => {
    onEmergencyActiveRef.current = onEmergencyActive;
  }, [onEmergencyActive]);

  useEffect(() => {
    onCommandAckRef.current = onCommandAck;
  }, [onCommandAck]);

  useEffect(() => {
    if (!autoConnect) return;

    const socket = getSocket();
    socketRef.current = socket;

    // ── Connection events ──
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    // ── Navigation events ──
    const handleLidarScan = (data: LidarScanPayload) => {
      setLidarPoints(data.points);
      setLidarFov(data.fov_degrees ?? data.fov ?? 270);
      onLidarScanRef.current?.(data);
    };

    const handleLidarMap = (data: LidarScanPayload) => {
      setMapPoints(data.points);
    };

    const handleNavStatus = (data: NavStatusPayload) => {
      setNavStatus(data);
      setIsEmergency(data.emergency_active);
      onNavStatusRef.current?.(data);
    };

    const handleEmergencyActive = (data: EmergencyActivePayload) => {
      setIsEmergency(data.active ?? true);
      onEmergencyActiveRef.current?.(data);
    };

    const handleCommandAck = (data: CommandAckPayload) => {
      onCommandAckRef.current?.(data);
    };

    const handleRobotTelemetry = (data: RobotTelemetryPayload) => {
      setRobot(data.robots.find((item) => item.id === "robot-001") ?? data.robots[0] ?? null);
    };

    const handleSystemHealth = (data: SystemHealthPayload) => {
      if (data.bridge) setBridgeStatus(data.bridge);
    };

    const handleBridgeStatus = (data: BridgeStatusPayload) => {
      setBridgeStatus(data);
    };

    const handleSlamMapUpdate = (data: SlamMapData) => {
      if (data.cleared) {
        setSlamMap(null);
      } else {
        setSlamMap(data);
      }
    };

    const handleRobotPose = (data: RobotPosePayload) => {
      setRobotPose({ x: data.x, y: data.y, heading: data.heading });
    };

    // Subscribe
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("lidar_scan", handleLidarScan);
    socket.on("lidar_map", handleLidarMap);
    socket.on("nav_status", handleNavStatus);
    socket.on("emergency_active", handleEmergencyActive);
    socket.on("command_ack", handleCommandAck);
    socket.on("robot_telemetry", handleRobotTelemetry);
    socket.on("system_health", handleSystemHealth);
    socket.on("bridge_status", handleBridgeStatus);
    socket.on("slam_map_update", handleSlamMapUpdate);
    socket.on("robot_pose", handleRobotPose);

    // Connect if not already
    if (!socket.connected) {
      socket.connect();
    } else {
      const frame = requestAnimationFrame(() => handleConnect());
      return () => {
        cancelAnimationFrame(frame);
        socket.off("connect", handleConnect);
        socket.off("disconnect", handleDisconnect);
        socket.off("lidar_scan", handleLidarScan);
        socket.off("lidar_map", handleLidarMap);
        socket.off("nav_status", handleNavStatus);
        socket.off("emergency_active", handleEmergencyActive);
        socket.off("command_ack", handleCommandAck);
        socket.off("robot_telemetry", handleRobotTelemetry);
        socket.off("system_health", handleSystemHealth);
        socket.off("bridge_status", handleBridgeStatus);
        socket.off("slam_map_update", handleSlamMapUpdate);
        socket.off("robot_pose", handleRobotPose);
      };
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("lidar_scan", handleLidarScan);
      socket.off("lidar_map", handleLidarMap);
      socket.off("nav_status", handleNavStatus);
      socket.off("emergency_active", handleEmergencyActive);
      socket.off("command_ack", handleCommandAck);
      socket.off("robot_telemetry", handleRobotTelemetry);
      socket.off("system_health", handleSystemHealth);
      socket.off("bridge_status", handleBridgeStatus);
      socket.off("slam_map_update", handleSlamMapUpdate);
      socket.off("robot_pose", handleRobotPose);
    };
  }, [autoConnect]);

  const sendNavCommand = useCallback(
    (
      action: string,
      robotId?: string,
      params?: Record<string, unknown>,
    ) => {
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit("navigation_command", {
          action,
          robot_id: robotId ?? "robot-001",
          robotId: robotId ?? "robot-001",
          ...params,
        });
      } else {
        console.warn("[Navigation Socket] Cannot send — not connected");
      }
    },
    [],
  );

  return {
    isConnected,
    lidarPoints,
    mapPoints,
    lidarFov,
    navStatus,
    isEmergency,
    robot,
    bridgeConnected: (bridgeStatus?.connected_count ?? 0) > 0,
    bridgeStatus,
    slamMap,
    robotPose,
    sendNavCommand,
  };
}
