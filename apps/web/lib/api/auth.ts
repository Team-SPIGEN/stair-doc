/**
 * Auth API client – login, register, me.
 *
 * Uses the same `apiFetch` envelope pattern as other API modules.
 */

import { OpenAPI } from "@/lib/api/client";
import type {
  LoginRequest,
  RegisterRequest,
  TokenResponse,
  User,
} from "@/types/auth";

// ── API Response envelope ────────────────────────────────────────────────

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
}

// ── Error class ──────────────────────────────────────────────────────────

export class AuthApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

// ── Fetch helper (with optional auth header) ─────────────────────────────

async function authFetch<T>(
  path: string,
  init?: RequestInit,
  token?: string | null,
): Promise<T> {
  const url = `${OpenAPI.BASE}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new AuthApiError(
      body?.detail ?? body?.message ?? `Request failed: ${response.status}`,
      response.status,
      body,
    );
  }

  const envelope: ApiResponse<T> = await response.json();

  if (!envelope.success) {
    throw new AuthApiError(envelope.message, response.status);
  }

  return envelope.data;
}

// ── Token storage ────────────────────────────────────────────────────────

const TOKEN_KEY = "stairdoc_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
  // Also set a cookie so Next.js middleware can read it
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${60 * 60 * 24 * 20}; SameSite=Lax`;
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

// ── Auth API functions ───────────────────────────────────────────────────

/**
 * Log in with email + password. Returns JWT + user.
 */
export async function login(body: LoginRequest): Promise<TokenResponse> {
  return authFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Register a new user (admin-only). Requires auth token.
 */
export async function register(
  body: RegisterRequest,
  token: string,
): Promise<TokenResponse> {
  return authFetch<TokenResponse>(
    "/api/v1/auth/register",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    token,
  );
}

/**
 * Fetch the current authenticated user's profile.
 */
export async function fetchMe(token: string): Promise<User> {
  return authFetch<User>("/api/v1/auth/me", { method: "GET" }, token);
}
