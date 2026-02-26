"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { WifiOff } from "lucide-react";

/**
 * Displays a banner when the device goes offline
 * Important for PWA users who may lose connectivity
 */
export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white safe-top">
      <WifiOff className="mr-2 inline h-4 w-4" />
      You are offline. Some features may be unavailable.
    </div>
  );
}
