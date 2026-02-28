/**
 * Stair-Doc Camera API client
 *
 * Typed fetch wrapper for camera image upload, photo gallery, and stream info.
 */

import { OpenAPI } from "@/lib/api/client";

// ── Types matching backend Pydantic schemas ──────────────────────────────

export type CameraSource = "front" | "rear" | "verification";

export type PhotoType =
  | "delivery_proof"
  | "recipient_verify"
  | "obstacle"
  | "snapshot"
  | "environment";

export interface PhotoResponse {
  id: string;
  robot_id: string;
  delivery_id: string | null;
  photo_type: PhotoType;
  camera_source: CameraSource;
  caption: string | null;
  filename: string;
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  size_bytes: number;
  robot_floor: number | null;
  recipient_rfid: string | null;
  captured_at: string;
  uploaded_at: string;
}

export interface PhotoListResponse {
  photos: PhotoResponse[];
  total: number;
  page: number;
  page_size: number;
  timestamp: string;
}

export interface CameraStreamInfo {
  robot_id: string;
  robot_name: string;
  stream_active: boolean;
  stream_url: string | null;
  fps: number;
  resolution: string;
  camera_source: CameraSource;
  last_frame_at: string | null;
}

export interface UploadPhotoPayload {
  robot_id: string;
  photo_type?: PhotoType;
  camera_source?: CameraSource;
  delivery_id?: string | null;
  caption?: string | null;
  robot_floor?: number | null;
  recipient_rfid?: string | null;
  file: File;
}

export interface FetchPhotosParams {
  robot_id?: string;
  photo_type?: PhotoType;
  from?: string; // ISO 8601
  to?: string; // ISO 8601
  page?: number;
  page_size?: number;
}

// ── API Response envelope ────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

// ── API Error ────────────────────────────────────────────────────────────

export class CameraApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "CameraApiError";
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
    throw new CameraApiError(
      body?.detail ?? body?.message ?? `Request failed: ${response.status}`,
      response.status,
      body,
    );
  }

  const envelope: ApiResponse<T> = await response.json();

  if (!envelope.success) {
    throw new CameraApiError(envelope.message, response.status);
  }

  return envelope.data;
}

/**
 * Upload for multipart/form-data — skips Content-Type header so the
 * browser can set the boundary automatically.
 */
async function apiFormFetch<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const url = `${OpenAPI.BASE}${path}`;

  const response = await fetch(url, {
    method: "POST",
    body: formData,
    // Do NOT set Content-Type — browser adds multipart boundary
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new CameraApiError(
      body?.detail ?? body?.message ?? `Upload failed: ${response.status}`,
      response.status,
      body,
    );
  }

  const envelope: ApiResponse<T> = await response.json();

  if (!envelope.success) {
    throw new CameraApiError(envelope.message, response.status);
  }

  return envelope.data;
}

// ── Camera API ───────────────────────────────────────────────────────────

/**
 * Upload a photo from a robot camera.
 */
export async function uploadPhoto(
  payload: UploadPhotoPayload,
): Promise<PhotoResponse> {
  const formData = new FormData();
  formData.append("robot_id", payload.robot_id);
  formData.append("file", payload.file);

  if (payload.photo_type)
    formData.append("photo_type", payload.photo_type);
  if (payload.camera_source)
    formData.append("camera_source", payload.camera_source);
  if (payload.delivery_id)
    formData.append("delivery_id", payload.delivery_id);
  if (payload.caption) formData.append("caption", payload.caption);
  if (payload.robot_floor != null)
    formData.append("robot_floor", String(payload.robot_floor));
  if (payload.recipient_rfid)
    formData.append("recipient_rfid", payload.recipient_rfid);

  return apiFormFetch<PhotoResponse>("/api/v1/camera/upload", formData);
}

/**
 * Fetch photo gallery with optional filters and pagination.
 */
export async function fetchPhotos(
  params?: FetchPhotosParams,
): Promise<PhotoListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.robot_id) searchParams.set("robot_id", params.robot_id);
  if (params?.photo_type) searchParams.set("photo_type", params.photo_type);
  if (params?.from) searchParams.set("from", params.from);
  if (params?.to) searchParams.set("to", params.to);
  if (params?.page) searchParams.set("page", String(params.page));
  if (params?.page_size)
    searchParams.set("page_size", String(params.page_size));

  const qs = searchParams.toString();
  return apiFetch<PhotoListResponse>(
    `/api/v1/camera/photos${qs ? `?${qs}` : ""}`,
  );
}

/**
 * Get a single photo by ID.
 */
export async function fetchPhoto(photoId: string): Promise<PhotoResponse> {
  return apiFetch<PhotoResponse>(`/api/v1/camera/photos/${photoId}`);
}

/**
 * List all camera streams (one per robot).
 */
export async function fetchCameraStreams(): Promise<CameraStreamInfo[]> {
  return apiFetch<CameraStreamInfo[]>("/api/v1/camera/streams");
}

/**
 * Get camera stream info for a specific robot.
 */
export async function fetchCameraStream(
  robotId: string,
): Promise<CameraStreamInfo> {
  return apiFetch<CameraStreamInfo>(`/api/v1/camera/streams/${robotId}`);
}

/**
 * Delete a photo by ID (admin action).
 */
export async function deletePhoto(
  photoId: string,
): Promise<{ id: string; deleted: boolean }> {
  return apiFetch<{ id: string; deleted: boolean }>(
    `/api/v1/camera/photos/${photoId}`,
    { method: "DELETE" },
  );
}
