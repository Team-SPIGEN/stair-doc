/**
 * Stair-Doc Delivery API client
 *
 * Typed fetch wrapper for delivery management endpoints.
 */

import { OpenAPI } from "@/lib/api/client";

// ── Types matching backend Pydantic schemas ──────────────────────────────

export type DeliveryStatusType =
  | "pending"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "climbing_stairs"
  | "arrived"
  | "delivered"
  | "failed"
  | "cancelled";

export type PriorityType = "normal" | "urgent" | "express";

export interface DeliveryLocationResponse {
  floor: number;
  building: string;
  room: string | null;
}

export interface DeliveryResponse {
  id: string;
  robot_id: string | null;
  status: DeliveryStatusType;
  pickup_location: DeliveryLocationResponse;
  dropoff_location: DeliveryLocationResponse;
  package_weight: number;
  priority: PriorityType;
  recipient_name: string | null;
  notes: string | null;
  estimated_arrival: string | null;
  actual_arrival: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryListResponse {
  deliveries: DeliveryResponse[];
  total: number;
  timestamp: string;
}

export interface DeliveryCreatePayload {
  pickup_location: {
    floor: number;
    building: string;
    room?: string | null;
  };
  dropoff_location: {
    floor: number;
    building: string;
    room?: string | null;
  };
  package_weight?: number;
  priority?: PriorityType;
  recipient_name?: string | null;
  notes?: string | null;
}

// ── API Response envelope ────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

// ── API Error (reuse pattern from robot-status) ──────────────────────────

export class DeliveryApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "DeliveryApiError";
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
    throw new DeliveryApiError(
      body?.detail ?? body?.message ?? `Request failed: ${response.status}`,
      response.status,
      body,
    );
  }

  const envelope: ApiResponse<T> = await response.json();

  if (!envelope.success) {
    throw new DeliveryApiError(envelope.message, response.status);
  }

  return envelope.data;
}

// ── Delivery API ─────────────────────────────────────────────────────────

export interface FetchDeliveriesParams {
  status?: DeliveryStatusType;
  priority?: PriorityType;
  sort?: "asc" | "desc";
}

/**
 * Fetch all deliveries with optional filters.
 */
export async function fetchDeliveries(
  params?: FetchDeliveriesParams,
): Promise<DeliveryListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.priority) searchParams.set("priority", params.priority);
  if (params?.sort) searchParams.set("sort", params.sort);

  const qs = searchParams.toString();
  const path = `/api/v1/deliveries${qs ? `?${qs}` : ""}`;
  return apiFetch<DeliveryListResponse>(path);
}

/**
 * Fetch a single delivery by ID.
 */
export async function fetchDelivery(
  deliveryId: string,
): Promise<DeliveryResponse> {
  return apiFetch<DeliveryResponse>(`/api/v1/deliveries/${deliveryId}`);
}

/**
 * Create a new delivery.
 */
export async function createDelivery(
  payload: DeliveryCreatePayload,
): Promise<DeliveryResponse> {
  return apiFetch<DeliveryResponse>("/api/v1/deliveries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
