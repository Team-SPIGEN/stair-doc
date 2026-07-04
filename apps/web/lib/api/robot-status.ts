/**
 * Stair-Doc API client
 *
 * Typed fetch wrapper for the FastAPI backend.
 * Uses the OpenAPI BASE URL from the generated client config.
 */

import { OpenAPI } from "@/lib/api/client";

// ── Types matching backend Pydantic schemas ──────────────────────────────

export interface LocationResponse {
  floor: number;
  building: string;
  room: string | null;
  x: number;
  y: number;
}

export interface BatteryResponse {
  level: number;
  is_charging: boolean;
  voltage: number;
  temperature: number;
  estimated_minutes_remaining: number;
}

export interface SensorsResponse {
  obstacle_detected: boolean;
  stair_detected: boolean;
  distance_to_obstacle: number | null;
  incline_angle: number;
  weight_kg: number;
  esp32_connected: boolean;
  esp32_port: string | null;
  esp32_connection: string | null;
}

export type RobotStatusType =
  | "idle"
  | "climbing"
  | "descending"
  | "delivering"
  | "returning"
  | "charging"
  | "maintenance"
  | "emergency"
  | "offline";

export type LockStatusType = "locked" | "unlocked" | "error";

export interface RobotStatusResponse {
  id: string;
  name: string;
  serial_number: string;
  status: RobotStatusType;
  lock_status: LockStatusType;
  location: LocationResponse;
  battery: BatteryResponse;
  sensors: SensorsResponse;
  speed: number;
  stairs_climbed: number;
  total_deliveries: number;
  current_delivery_id: string | null;
  last_seen: string;
  uptime_seconds: number;
}

export interface RobotStatusListResponse {
  robots: RobotStatusResponse[];
  total: number;
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

// ── Robot Status API ─────────────────────────────────────────────────────

/**
 * Fetch status of all robots.
 */
export async function fetchAllRobotStatus(): Promise<RobotStatusListResponse> {
  return apiFetch<RobotStatusListResponse>("/api/v1/robot/status");
}

/**
 * Fetch status of a single robot by ID.
 */
export async function fetchRobotStatus(
  robotId: string,
): Promise<RobotStatusResponse> {
  return apiFetch<RobotStatusResponse>(`/api/v1/robot/status/${robotId}`);
}
