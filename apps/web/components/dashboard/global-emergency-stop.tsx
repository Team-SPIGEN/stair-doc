"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { OctagonX, AlertTriangle, Loader2 } from "lucide-react";
import { getSocket } from "@/lib/socket/client";

/**
 * Floating global emergency stop button — visible on every page.
 *
 * Sends `robot_command` → `emergency_stop` via Socket.IO when double-tapped.
 * First tap shows confirmation state (pulsing red), second tap fires the command.
 */
export function GlobalEmergencyStop() {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const handleClick = useCallback(async () => {
    if (!isConfirming) {
      setIsConfirming(true);
      // Auto-reset after 3 seconds if not confirmed
      setTimeout(() => setIsConfirming(false), 3000);
      return;
    }

    setIsSending(true);
    try {
      const socket = getSocket();
      if (socket.connected) {
        socket.emit("robot_command", {
          action: "emergency_stop",
          robotId: null,
        });
      }
    } finally {
      setIsSending(false);
      setIsConfirming(false);
    }
  }, [isConfirming]);

  return (
    <button
      onClick={handleClick}
      disabled={isSending}
      title={isConfirming ? "Click again to confirm STOP" : "Emergency Stop — All Robots"}
      className={cn(
        "fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
        "min-h-[44px] min-w-[44px] touch-manipulation",
        "hover:scale-110 active:scale-95",
        "md:bottom-8 md:right-8",
        isConfirming
          ? "bg-red-600 shadow-red-500/50 animate-pulse ring-4 ring-red-400/50"
          : "bg-gradient-to-br from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 shadow-red-500/30",
        isSending && "cursor-not-allowed opacity-75",
      )}
    >
      {isSending ? (
        <Loader2 className="h-6 w-6 text-white animate-spin" />
      ) : isConfirming ? (
        <AlertTriangle className="h-6 w-6 text-white" />
      ) : (
        <OctagonX className="h-6 w-6 text-white" />
      )}
    </button>
  );
}
