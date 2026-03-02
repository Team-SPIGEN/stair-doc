"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getSocket } from "@/lib/socket/client";

export interface KeyboardShortcutsOptions {
  /** Disable all shortcuts (e.g. when a modal / input is focused) */
  disabled?: boolean;
  /** Called when Space is tapped for emergency stop confirmation */
  onEmergencyStop?: () => void;
  /** Called when `v` is pressed to toggle voice listening */
  onToggleVoice?: () => void;
  /** Called when Escape is pressed */
  onEscape?: () => void;
}

const SHORTCUT_HELP = [
  { key: "Space", action: "Emergency Stop (hold 1 s)" },
  { key: "R", action: "Refresh robot status" },
  { key: "N", action: "Go to Navigation" },
  { key: "C", action: "Go to Camera" },
  { key: "D", action: "Go to Deliveries" },
  { key: "V", action: "Toggle voice commands" },
  { key: "?", action: "Show this help" },
  { key: "Esc", action: "Close / stop" },
];

/**
 * Global keyboard shortcuts hook.
 *
 * Mount once at the root layout level (via a `<KeyboardShortcutsProvider>` client component).
 * Shortcuts are suppressed when the active element is an input, textarea, or select.
 *
 * | Key   | Action                                               |
 * |-------|------------------------------------------------------|
 * | Space | Emergency stop — must be held for ~800 ms             |
 * | R     | Re-subscribe robot socket (force refresh)           |
 * | N     | Navigate to /navigation                             |
 * | C     | Navigate to /camera                                 |
 * | D     | Navigate to /deliveries                             |
 * | V     | Toggle voice commands                               |
 * | ?     | Print shortcut cheatsheet toast                     |
 * | Esc   | Fire onEscape callback                             |
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { disabled = false, onEmergencyStop, onToggleVoice, onEscape } = options;
  const router = useRouter();
  const spaceHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceConfirmed = useRef(false);

  const isTyping = useCallback(() => {
    const tag = document.activeElement?.tagName.toLowerCase();
    const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
    return tag === "input" || tag === "textarea" || tag === "select" || isEditable;
  }, []);

  const triggerEmergencyStop = useCallback(() => {
    try {
      const socket = getSocket();
      if (socket.connected) {
        socket.emit("robot_command", { action: "emergency_stop", robotId: null });
        toast.error("⛔ Emergency Stop sent — all robots halted", {
          duration: 5000,
          id: "emergency-stop",
        });
      } else {
        toast.warning("Socket disconnected — Emergency Stop NOT sent", {
          duration: 5000,
          id: "emergency-stop-warn",
        });
      }
    } catch {
      toast.error("Failed to send Emergency Stop command");
    }
    onEmergencyStop?.();
  }, [onEmergencyStop]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled || isTyping()) return;

      switch (e.code) {
        case "Space": {
          e.preventDefault();
          if (spaceConfirmed.current) return;
          // Show pending toast immediately
          toast.loading("Hold Space to confirm Emergency Stop…", {
            id: "space-hold",
            duration: 1000,
          });
          spaceHoldTimer.current = setTimeout(() => {
            spaceConfirmed.current = true;
            toast.dismiss("space-hold");
            triggerEmergencyStop();
          }, 800);
          break;
        }

        case "KeyR": {
          e.preventDefault();
          const socket = getSocket();
          if (socket.connected) {
            socket.emit("request_robot_status");
            toast.info("Refreshing robot status…", { duration: 2000 });
          }
          break;
        }

        case "KeyN":
          e.preventDefault();
          router.push("/navigation");
          break;

        case "KeyC":
          e.preventDefault();
          router.push("/camera");
          break;

        case "KeyD":
          e.preventDefault();
          router.push("/deliveries");
          break;

        case "KeyV":
          e.preventDefault();
          onToggleVoice?.();
          break;

        case "Slash": {
          if (e.shiftKey) {
            e.preventDefault(); // "?"
            const lines = SHORTCUT_HELP.map(
              (s) => `${s.key.padEnd(8)} → ${s.action}`
            ).join("  |  ");
            toast.info(`Keyboard shortcuts: ${lines}`, {
              duration: 8000,
              id: "shortcut-help",
            });
          }
          break;
        }

        case "Escape":
          onEscape?.();
          break;

        default:
          break;
      }
    },
    [disabled, isTyping, triggerEmergencyStop, router, onToggleVoice, onEscape]
  );

  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === "Space") {
      if (spaceHoldTimer.current) {
        clearTimeout(spaceHoldTimer.current);
        spaceHoldTimer.current = null;
      }
      if (!spaceConfirmed.current) {
        toast.dismiss("space-hold");
      }
      spaceConfirmed.current = false;
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (spaceHoldTimer.current) clearTimeout(spaceHoldTimer.current);
    };
  }, [handleKeyDown, handleKeyUp]);

  return { shortcuts: SHORTCUT_HELP };
}
