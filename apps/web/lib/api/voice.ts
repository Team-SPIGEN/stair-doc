/**
 * Voice command API client for Stair-Doc.
 */

import { OpenAPI } from "@/lib/api/client";

export type VoiceAction =
  | "navigate"
  | "stop"
  | "emergency_stop"
  | "unlock_container"
  | "take_photo"
  | "status"
  | "return_home"
  | "create_delivery";

export interface VoiceCommandIntent {
  action: VoiceAction;
  target_floor?: number | null;
  tag_id?: string | null;
  camera_source?: string | null;
  recipient_name?: string | null;
  requires_confirmation: boolean;
  confidence: number;
}

export interface SupportedCommand {
  phrase: string;
  action: VoiceAction;
  description: string;
  example: string;
  role_required: string;
}

export interface SupportedCommandsResponse {
  commands: SupportedCommand[];
}

export interface VoiceCommandResponse {
  success: boolean;
  text: string;
  robot_id: string;
  intent: VoiceCommandIntent;
  message: string;
  executed: boolean;
  eta_seconds?: number | null;
  timestamp: string;
}

export interface VoiceCommandPayload {
  text: string;
  user_role: "admin" | "operator" | "recipient";
  robot_id?: string;
  confirm?: boolean;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

export class VoiceApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "VoiceApiError";
  }
}

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
    throw new VoiceApiError(
      body?.detail ?? body?.message ?? `Request failed: ${response.status}`,
      response.status,
      body,
    );
  }

  const envelope: ApiEnvelope<T> = await response.json();

  if (!envelope.success) {
    throw new VoiceApiError(envelope.message, response.status, envelope);
  }

  return envelope.data;
}

export async function sendVoiceCommand(
  payload: VoiceCommandPayload,
): Promise<VoiceCommandResponse> {
  return apiFetch<VoiceCommandResponse>("/api/v1/voice/command", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchSupportedCommands(): Promise<SupportedCommand[]> {
  const result = await apiFetch<SupportedCommandsResponse>("/api/v1/voice/commands");
  return result.commands;
}
