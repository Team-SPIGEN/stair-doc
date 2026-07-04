import type { UserRole } from "@/types/auth";

/** Feature access matrix — keep in sync with Settings → Role Permissions. */
export const ROLE_PERMISSIONS: Record<string, UserRole[]> = {
  dashboard: ["operator", "admin"],
  deliveries: ["operator", "admin", "recipient"],
  createDelivery: ["operator", "admin"],
  navigation: ["operator", "admin"],
  rfidScan: ["operator", "admin", "recipient"],
  rfidTagManagement: ["admin"],
  camera: ["operator", "admin", "recipient"],
  gallery: ["operator", "admin"],
  analytics: ["admin"],
  settings: ["operator", "admin"],
  registerUsers: ["admin"],
};

export type Permission = keyof typeof ROLE_PERMISSIONS;

export function hasPermission(
  role: UserRole | null | undefined,
  permission: Permission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[permission].includes(role);
}
