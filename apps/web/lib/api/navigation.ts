/**
 * Navigation API client for Stair-Doc.
 *
 * Typed fetch wrapper for navigation control endpoints:
 *   POST /navigation/command      — manual joystick
 *   POST /navigation/autonomous   — start Destination Nav2 goal
 *   GET  /navigation/locations    — named rooms catalog
 *   GET  /navigation/status       — current nav status
 *   POST /navigation/reset-estop  — clear emergency stop
 */

import { OpenAPI } from "@/lib/api/client";

// ── Types matching backend Pydantic schemas ──────────────────────────────

export type NavigationCommand =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "stop"
  | "emergency_stop";

export type NavigationMode = "manual" | "autonomous" | "idle" | "emergency";

export interface ManualCommandRequest {
  command: NavigationCommand;
  speed?: number;
  duration?: number;
  robot_id?: string;
}

export interface AutonomousRequest {
  robot_id?: string;
  /** Floor is unused for now (coming soon). */
  target_floor?: number;
  /** Required room / Destination name (id or alias from locations.json). */
  target_location: string;
}

export interface NavGoalPose {
  x: number;
  y: number;
  yaw: number;
  frame_id: string;
  room_id: string;
  map: string;
}

export interface CommandResponse {
  success: boolean;
  command: string;
  robot_id: string;
  speed: number;
  timestamp: string;
}

export interface AutonomousResponse {
  success: boolean;
  robot_id: string;
  target_floor: number;
  target_location: string | null;
  goal?: NavGoalPose | null;
  eta_seconds: number;
  eta_display: string;
  path: Array<{ x: number; y: number; floor: number; label: string; yaw?: number }>;
  message?: string;
  timestamp: string;
}

export interface LocationRoom {
  id: string;
  aliases: string[];
  x: number;
  y: number;
  yaw: number;
  frame_id: string;
  map: string;
}

export interface LocationsResponse {
  rooms: LocationRoom[];
  count: number;
}

export interface NavigationStatusResponse {
  robot_id: string;
  mode: NavigationMode;
  target_floor: number | null;
  target_location: string | null;
  progress: number;
  eta_seconds: number | null;
  current_speed: number;
  emergency_active: boolean;
  timestamp: string;
}

// ── API Response envelope ────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

// ── API Error ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Fetch helper ─────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${OpenAPI.BASE}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail =
      typeof body?.detail === "string"
        ? body.detail
        : Array.isArray(body?.detail)
          ? body.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ")
          : body?.message;
    throw new ApiError(
      detail ?? `Request failed: ${response.status}`,
      response.status,
      body,
    );
  }

  const envelope: ApiResponse<T> = await response.json();

  if (!envelope.success) {
    throw new ApiError(envelope.message, response.status);
  }

  return envelope.data;
}

// ── Navigation API ───────────────────────────────────────────────────────

/**
 * Send a manual navigation command (forward, backward, left, right, stop, emergency_stop).
 */
export async function sendNavigationCommand(
  body: ManualCommandRequest,
): Promise<CommandResponse> {
  return apiFetch<CommandResponse>("/api/v1/navigation/command", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Start autonomous navigation to a named Destination (Nav2 via ros2_bridge).
 */
export async function startAutonomousNavigation(
  body: AutonomousRequest,
): Promise<AutonomousResponse> {
  return apiFetch<AutonomousResponse>("/api/v1/navigation/autonomous", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * List named Destinations from maps/locations.json.
 */
export async function fetchLocations(): Promise<LocationsResponse> {
  return apiFetch<LocationsResponse>("/api/v1/navigation/locations");
}

/**
 * Get navigation status for a specific robot.
 */
export async function fetchNavigationStatus(
  robotId = "robot-001",
): Promise<NavigationStatusResponse> {
  return apiFetch<NavigationStatusResponse>(
    `/api/v1/navigation/status?robot_id=${encodeURIComponent(robotId)}`,
  );
}

/**
 * Reset emergency stop for a specific robot.
 */
export async function resetEmergencyStop(
  robotId = "robot-001",
): Promise<CommandResponse> {
  return apiFetch<CommandResponse>(
    `/api/v1/navigation/reset-estop?robot_id=${encodeURIComponent(robotId)}`,
    { method: "POST" },
  );
}

/**
 * Enter or exit a navigation mode (hub Enter Manual / Enter Autonomous / Exit).
 * Enter Autonomous arms the mode but does not start a Nav2 goal.
 */
export async function setNavigationMode(
  mode: Exclude<NavigationMode, "emergency">,
  robotId = "robot-001",
): Promise<NavigationStatusResponse> {
  return apiFetch<NavigationStatusResponse>("/api/v1/navigation/mode", {
    method: "POST",
    body: JSON.stringify({ robot_id: robotId, mode }),
  });
}
