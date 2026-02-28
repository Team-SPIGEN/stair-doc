/**
 * useRobotSocket — React hook for real-time robot telemetry via Socket.IO.
 *
 * Connects on mount, subscribes to `robot_telemetry` and `system_health`
 * events, and provides methods to send commands (emergency stop, resume).
 *
 * @example
 * ```tsx
 * const { isConnected, robots, systemHealth, sendCommand } = useRobotSocket();
 * ```
 */
"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { getSocket, destroySocket } from "@/lib/socket/client";
import type { RobotStatusResponse } from "@/lib/api/robot-status";

// ── Socket event payload types ──────────────────────────────────────────

export interface RobotTelemetryPayload {
  robots: RobotStatusResponse[];
  total: number;
  timestamp: string;
}

export interface SystemHealthPayload {
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_latency_ms: number;
  lidar_status: "operational" | "degraded" | "offline";
  camera_status: "operational" | "degraded" | "offline";
  mqtt_connected: boolean;
  database_connected: boolean;
  uptime_seconds: number;
  active_connections: number;
  errors_last_hour: number;
  warnings_last_hour: number;
  timestamp: string;
}

export interface DeliveryUpdatePayload {
  type: string;
  robot_id: string | null;
  timestamp: string;
  message: string;
}

export interface CommandAckPayload {
  action: string;
  robot_id: string | null;
  status: "accepted" | "rejected";
  timestamp: string;
}

// ── Hook options ────────────────────────────────────────────────────────

interface UseRobotSocketOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Callback on telemetry update */
  onTelemetry?: (data: RobotTelemetryPayload) => void;
  /** Callback on system health update */
  onSystemHealth?: (data: SystemHealthPayload) => void;
  /** Callback on delivery update (e.g., emergency stop broadcast) */
  onDeliveryUpdate?: (data: DeliveryUpdatePayload) => void;
}

interface UseRobotSocketReturn {
  /** Whether the socket is currently connected */
  isConnected: boolean;
  /** Latest robot telemetry list */
  robots: RobotStatusResponse[];
  /** Latest system health snapshot */
  systemHealth: SystemHealthPayload | null;
  /** Number of telemetry ticks received */
  tickCount: number;
  /** Send a command to a specific robot or all robots */
  sendCommand: (action: string, robotId?: string) => void;
  /** Manually connect the socket */
  connect: () => void;
  /** Manually disconnect the socket */
  disconnect: () => void;
}

// ── Hook implementation ─────────────────────────────────────────────────

export function useRobotSocket(
  options: UseRobotSocketOptions = {},
): UseRobotSocketReturn {
  const { autoConnect = true, onTelemetry, onSystemHealth, onDeliveryUpdate } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [robots, setRobots] = useState<RobotStatusResponse[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealthPayload | null>(null);
  const [tickCount, setTickCount] = useState(0);

  // Store latest callbacks in refs to avoid re-subscribing on every render
  const onTelemetryRef = useRef(onTelemetry);
  const onSystemHealthRef = useRef(onSystemHealth);
  const onDeliveryUpdateRef = useRef(onDeliveryUpdate);

  useEffect(() => {
    onTelemetryRef.current = onTelemetry;
  }, [onTelemetry]);

  useEffect(() => {
    onSystemHealthRef.current = onSystemHealth;
  }, [onSystemHealth]);

  useEffect(() => {
    onDeliveryUpdateRef.current = onDeliveryUpdate;
  }, [onDeliveryUpdate]);

  useEffect(() => {
    if (!autoConnect) return;

    const socket = getSocket();
    socketRef.current = socket;

    // ── Connection events ──
    const handleConnect = () => {
      setIsConnected(true);
      console.log("[Socket.IO] Connected:", socket.id);
    };

    const handleDisconnect = (reason: string) => {
      setIsConnected(false);
      console.log("[Socket.IO] Disconnected:", reason);
    };

    const handleConnectError = (err: Error) => {
      console.warn("[Socket.IO] Connection error:", err.message);
      setIsConnected(false);
    };

    // ── Data events ──
    const handleTelemetry = (data: RobotTelemetryPayload) => {
      setRobots(data.robots);
      setTickCount((prev) => prev + 1);
      onTelemetryRef.current?.(data);
    };

    const handleSystemHealth = (data: SystemHealthPayload) => {
      setSystemHealth(data);
      onSystemHealthRef.current?.(data);
    };

    const handleDeliveryUpdate = (data: DeliveryUpdatePayload) => {
      onDeliveryUpdateRef.current?.(data);
    };

    // Subscribe
    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("robot_telemetry", handleTelemetry);
    socket.on("system_health", handleSystemHealth);
    socket.on("delivery_update", handleDeliveryUpdate);

    // Connect (no-ops if already connected — handler syncs state)
    if (!socket.connected) {
      socket.connect();
    } else {
      // Socket is already connected (e.g. HMR re-mount).
      // Defer setState to satisfy react-hooks/set-state-in-effect.
      const frame = requestAnimationFrame(() => handleConnect());
      return () => {
        cancelAnimationFrame(frame);
        socket.off("connect", handleConnect);
        socket.off("disconnect", handleDisconnect);
        socket.off("connect_error", handleConnectError);
        socket.off("robot_telemetry", handleTelemetry);
        socket.off("system_health", handleSystemHealth);
        socket.off("delivery_update", handleDeliveryUpdate);
      };
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("robot_telemetry", handleTelemetry);
      socket.off("system_health", handleSystemHealth);
      socket.off("delivery_update", handleDeliveryUpdate);
    };
  }, [autoConnect]);

  const sendCommand = useCallback(
    (action: string, robotId?: string) => {
      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit("robot_command", {
          action,
          robotId: robotId ?? null,
        });
        console.log(`[Socket.IO] Sent ${action} → ${robotId ?? "all"}`);
      } else {
        console.warn("[Socket.IO] Cannot send command — not connected");
      }
    },
    [],
  );

  const connect = useCallback(() => {
    const socket = getSocket();
    socketRef.current = socket;
    if (!socket.connected) {
      socket.connect();
    }
  }, []);

  const disconnect = useCallback(() => {
    destroySocket();
    socketRef.current = null;
    setIsConnected(false);
  }, []);

  return {
    isConnected,
    robots,
    systemHealth,
    tickCount,
    sendCommand,
    connect,
    disconnect,
  };
}
