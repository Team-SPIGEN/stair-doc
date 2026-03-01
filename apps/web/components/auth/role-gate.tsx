"use client";

import { useAuth } from "@/contexts/auth-context";
import type { UserRole } from "@/types/auth";

interface RoleGateProps {
  /** One or more roles that are allowed to see the children. */
  allowed: UserRole[];
  /** Rendered when the current user's role is NOT in `allowed`. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally renders `children` only when the current user has one
 * of the `allowed` roles. Shows `fallback` (default: nothing) otherwise.
 *
 * @example
 * ```tsx
 * <RoleGate allowed={["admin", "operator"]}>
 *   <AdminPanel />
 * </RoleGate>
 * ```
 */
export function RoleGate({ allowed, fallback = null, children }: RoleGateProps) {
  const { role, isLoading } = useAuth();

  if (isLoading) return null;

  if (!role || !allowed.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
