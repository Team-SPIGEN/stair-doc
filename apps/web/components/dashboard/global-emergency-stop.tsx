"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { OctagonX, AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { getSocket } from "@/lib/socket/client";
import { ROBOT_ID } from "@/lib/robot";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Floating global emergency stop button — visible on every page.
 *
 * Sends `robot_command` → `emergency_stop` via Socket.IO when double-tapped.
 * First tap shows confirmation state (pulsing red), second tap fires the command.
 * Shows a full-screen overlay while stopped, with a "Resume Operations" dismiss.
 */
export function GlobalEmergencyStop() {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isStopped, setIsStopped] = useState(false);

  const triggerStop = useCallback(async () => {
    setIsSending(true);
    try {
      // Vibration feedback (mobile)
      if (typeof navigator.vibrate === "function") {
        navigator.vibrate([200, 100, 200, 100, 400]);
      }
      const socket = getSocket();
      if (socket.connected) {
        socket.emit("robot_command", { action: "emergency_stop", robotId: ROBOT_ID });
        toast.error("⛔ Emergency Stop activated — robot halted", {
          duration: 8000,
          id: "global-estop",
        });
      } else {
        toast.warning("Socket offline — E-STOP NOT sent to robot", {
          duration: 6000,
          id: "global-estop-warn",
        });
      }
      setIsStopped(true);
    } finally {
      setIsSending(false);
      setIsConfirming(false);
    }
  }, []);

  const handleClick = useCallback(async () => {
    if (!isConfirming) {
      setIsConfirming(true);
      setTimeout(() => setIsConfirming(false), 3000);
      return;
    }
    await triggerStop();
  }, [isConfirming, triggerStop]);

  const handleResume = useCallback(() => {
    const socket = getSocket();
    if (socket.connected) {
      socket.emit("robot_command", { action: "resume", robotId: ROBOT_ID });
      setIsStopped(false);
      toast.success("Operations resumed — robot ready for commands");
    } else {
      toast.warning("Socket offline — resume was not sent to robot", {
        duration: 6000,
        id: "global-estop-resume-warn",
      });
    }
  }, []);

  return (
    <>
      {/* ── Full-screen stopped overlay ─────────────────────────────── */}
      {isStopped && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-red-950/90 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-6 rounded-3xl border border-red-500/30 bg-red-950/80 p-10 text-center shadow-2xl">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-600 ring-8 ring-red-500/30 animate-pulse">
              <ShieldAlert className="h-10 w-10 text-white" />
            </div>
            <div>
              <p className="text-3xl font-black tracking-widest text-red-400">
                ⛔ ROBOT STOPPED
              </p>
              <p className="mt-2 text-sm text-red-300">
                Emergency stop has been activated. Robot operations halted.
              </p>
            </div>
            <Button
              size="lg"
              variant="outline"
              onClick={handleResume}
              className="border-red-400 text-red-300 hover:bg-red-900 hover:text-red-100"
            >
              Resume Operations
            </Button>
          </div>
        </div>
      )}

      {/* ── Floating button ─────────────────────────────────────────── */}
      <button
        onClick={handleClick}
        disabled={isSending || isStopped}
        title={
          isStopped
            ? "Robot stopped — click overlay to resume"
            : isConfirming
              ? "Click again to confirm STOP"
              : "Emergency Stop"
        }
        className={cn(
          "fixed bottom-6 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300",
          "min-h-[44px] min-w-[44px] touch-manipulation",
          "hover:scale-110 active:scale-95",
          "md:bottom-8 md:right-8",
          isStopped
            ? "bg-red-800 opacity-60 cursor-not-allowed"
            : isConfirming
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
    </>
  );
}
