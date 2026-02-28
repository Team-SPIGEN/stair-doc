/**
 * Stair-Doc RFID API client
 *
 * Typed fetch wrapper for RFID authorization, access logs, and tag management.
 */

import { OpenAPI } from "@/lib/api/client";

// ── Types matching backend Pydantic schemas ──────────────────────────────

export type RFIDScanType =
  | "checkpoint"
  | "pickup"
  | "dropoff"
  | "unlock"
  | "denied";

export type RFIDTagStatus = "active" | "revoked" | "expired" | "unknown";

export type ContainerStatus = "locked" | "unlocked" | "error";

export interface RFIDAuthorizeResponse {
  authorized: boolean;
  tag_id: string;
  robot_id: string;
  delivery_id: string | null;
  container_status: ContainerStatus;
  user_name: string | null;
  message: string;
  timestamp: string;
}

export interface RFIDLogEntry {
  id: string;
  tag_id: string;
  robot_id: string;
  delivery_id: string | null;
  scan_type: RFIDScanType;
  authorized: boolean;
  user_name: string | null;
  location: string | null;
  message: string;
  timestamp: string;
}

export interface RFIDLogListResponse {
  logs: RFIDLogEntry[];
  total: number;
  timestamp: string;
}

export interface RFIDTagResponse {
  tag_id: string;
  user_name: string;
  role: string;
  status: RFIDTagStatus;
  registered_at: string;
  last_used: string | null;
}

export interface RFIDAuthorizePayload {
  tag_id: string;
  robot_id: string;
  delivery_id?: string | null;
}

export interface RFIDRegisterPayload {
  tag_id: string;
  user_name: string;
  role?: string;
}

// ── API Response envelope ────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

// ── API Error ────────────────────────────────────────────────────────────

export class RFIDApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "RFIDApiError";
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
    throw new RFIDApiError(
      body?.detail ?? body?.message ?? `Request failed: ${response.status}`,
      response.status,
      body,
    );
  }

  const envelope: ApiResponse<T> = await response.json();

  if (!envelope.success) {
    throw new RFIDApiError(envelope.message, response.status);
  }

  return envelope.data;
}

// ── RFID API ─────────────────────────────────────────────────────────────

export interface FetchRFIDLogsParams {
  tag_id?: string;
  robot_id?: string;
  scan_type?: RFIDScanType;
  authorized?: boolean;
  limit?: number;
}

/**
 * Authorize an RFID scan (simulate container unlock).
 */
export async function authorizeRFID(
  payload: RFIDAuthorizePayload,
): Promise<RFIDAuthorizeResponse> {
  return apiFetch<RFIDAuthorizeResponse>("/api/v1/rfid/authorize", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Fetch RFID access logs with optional filters.
 */
export async function fetchRFIDLogs(
  params?: FetchRFIDLogsParams,
): Promise<RFIDLogListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.tag_id) searchParams.set("tag_id", params.tag_id);
  if (params?.robot_id) searchParams.set("robot_id", params.robot_id);
  if (params?.scan_type) searchParams.set("scan_type", params.scan_type);
  if (params?.authorized !== undefined)
    searchParams.set("authorized", String(params.authorized));
  if (params?.limit) searchParams.set("limit", String(params.limit));

  const qs = searchParams.toString();
  return apiFetch<RFIDLogListResponse>(`/api/v1/rfid/logs${qs ? `?${qs}` : ""}`);
}

/**
 * List all registered RFID tags.
 */
export async function fetchRFIDTags(): Promise<RFIDTagResponse[]> {
  return apiFetch<RFIDTagResponse[]>("/api/v1/rfid/tags");
}

/**
 * Register a new RFID tag.
 */
export async function registerRFIDTag(
  payload: RFIDRegisterPayload,
): Promise<RFIDTagResponse> {
  return apiFetch<RFIDTagResponse>("/api/v1/rfid/tags", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
