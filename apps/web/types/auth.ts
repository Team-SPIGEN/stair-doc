/**
 * Auth types shared across the frontend application.
 */

// ── Roles ────────────────────────────────────────────────────────────────

export type UserRole = "operator" | "recipient" | "admin";

// ── User ─────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  floor_access: number[];
  rfid_tags: string[];
  created_at: string;
}

// ── Auth request/response types ──────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  floor_access?: number[];
  rfid_tags?: string[];
}

export interface TokenResponse {
  token: string;
  user: User;
}
