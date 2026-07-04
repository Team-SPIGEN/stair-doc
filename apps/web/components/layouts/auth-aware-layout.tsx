"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/contexts/auth-context";
import { DashboardLayout } from "@/components/layouts/dashboard";
import { GlobalEmergencyStop } from "@/components/dashboard/global-emergency-stop";

/**
 * Wraps everything in `<AuthProvider>`.
 * Conditionally renders the dashboard chrome for authenticated routes
 * and a plain layout for /auth.
 */
export function AuthAwareLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname.replace(/\/$/, "") === "/auth";

  return (
    <AuthProvider>
      {isAuthPage ? (
        <div className="min-h-screen">{children}</div>
      ) : (
        <>
          <DashboardLayout>{children}</DashboardLayout>
          <GlobalEmergencyStop />
        </>
      )}
    </AuthProvider>
  );
}
