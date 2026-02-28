/**
 * Navigation API client for Stair-Doc.
 *
 * Typed fetch wrapper for navigation control endpoints:
 *   POST /navigation/command      — manual joystick
 *   POST /navigation/autonomous   — start autonomous nav
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
  target_floor: number;
  target_location?: string;
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
  eta_seconds: number;
  eta_display: string;
  path: Array<{ x: number; y: number; floor: number; label: string }>;
  timestamp: string;
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
    throw new ApiError(
      body?.detail ?? body?.message ?? `Request failed: ${response.status}`,
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
 * Start autonomous navigation to a target floor/location.
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
