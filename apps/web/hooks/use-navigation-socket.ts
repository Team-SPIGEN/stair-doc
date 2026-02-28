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

// ── Socket event payload types ──────────────────────────────────────────

export interface LidarPoint {
  angle: number;
  distance: number;
}

export interface LidarScanPayload {
  robot_id: string;
  points: LidarPoint[];
  scan_id: number;
  fov_degrees: number;
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
  activated_at: string;
  message: string;
}

export interface CommandAckPayload {
  action: string;
  robot_id: string | null;
  status: "accepted" | "rejected";
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
  /** LIDAR field of view in degrees */
  lidarFov: number;
  /** Latest navigation status */
  navStatus: NavStatusPayload | null;
  /** Whether emergency stop is active */
  isEmergency: boolean;
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
  const [lidarFov, setLidarFov] = useState(270);
  const [navStatus, setNavStatus] = useState<NavStatusPayload | null>(null);
  const [isEmergency, setIsEmergency] = useState(false);

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
      setLidarFov(data.fov_degrees);
      onLidarScanRef.current?.(data);
    };

    const handleNavStatus = (data: NavStatusPayload) => {
      setNavStatus(data);
      setIsEmergency(data.emergency_active);
      onNavStatusRef.current?.(data);
    };

    const handleEmergencyActive = (data: EmergencyActivePayload) => {
      setIsEmergency(true);
      onEmergencyActiveRef.current?.(data);
    };

    const handleCommandAck = (data: CommandAckPayload) => {
      onCommandAckRef.current?.(data);
    };

    // Subscribe
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("lidar_scan", handleLidarScan);
    socket.on("nav_status", handleNavStatus);
    socket.on("emergency_active", handleEmergencyActive);
    socket.on("command_ack", handleCommandAck);

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
        socket.off("nav_status", handleNavStatus);
        socket.off("emergency_active", handleEmergencyActive);
        socket.off("command_ack", handleCommandAck);
      };
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("lidar_scan", handleLidarScan);
      socket.off("nav_status", handleNavStatus);
      socket.off("emergency_active", handleEmergencyActive);
      socket.off("command_ack", handleCommandAck);
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
    lidarFov,
    navStatus,
    isEmergency,
    sendNavCommand,
  };
}
