"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User, UserRole, LoginRequest } from "@/types/auth";
import {
  login as apiLogin,
  fetchMe,
  getStoredToken,
  storeToken,
  clearToken,
} from "@/lib/api/auth";

// ── Context value ────────────────────────────────────────────────────────

interface AuthContextValue {
  /** The current authenticated user, or `null` when logged-out / loading. */
  user: User | null;
  /** Convenience shortcut for `user?.role`. */
  role: UserRole | null;
  /** `true` while the initial token validation is in-flight. */
  isLoading: boolean;
  /** Whether a valid user is present. */
  isAuthenticated: boolean;
  /** Log in with email + password.  Stores the JWT on success. */
  login: (req: LoginRequest) => Promise<void>;
  /** Clear token & user state.  Redirects to /auth. */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ── Provider ─────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, check for an existing token and validate it
  useEffect(() => {
    let cancelled = false;
    const token = getStoredToken();
    if (!token) {
      // No token → transition via callback to avoid synchronous setState in effect
      const id = requestAnimationFrame(() => {
        if (!cancelled) setIsLoading(false);
      });
      return () => {
        cancelled = true;
        cancelAnimationFrame(id);
      };
    }

    fetchMe(token)
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        // Token expired or invalid – clear it
        clearToken();
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (req: LoginRequest) => {
    const result = await apiLogin(req);
    storeToken(result.token);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    // Hard navigate to /auth so middleware picks it up
    window.location.href = "/auth";
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      role: user?.role ?? null,
      isLoading,
      isAuthenticated: !!user,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider />");
  }
  return ctx;
}
