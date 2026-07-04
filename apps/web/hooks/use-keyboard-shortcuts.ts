"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getSocket } from "@/lib/socket/client";
import { toggleSidebarCollapsed } from "@/lib/sidebar-toggle";

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

const G_CHORD_MS = 1500;

export const SHORTCUT_HELP = [
  { key: "Space (hold)", action: "Emergency Stop" },
  { key: "Ctrl+B", action: "Toggle sidebar" },
  { key: "G → D", action: "Go to Dashboard (Overview)" },
  { key: "G → L", action: "Go to Deliveries" },
  { key: "R", action: "Refresh robot status" },
  { key: "N", action: "Go to Navigation" },
  { key: "C", action: "Go to Camera" },
  { key: "D", action: "Go to Deliveries" },
  { key: "V", action: "Toggle voice commands" },
  { key: "?", action: "Show shortcut help" },
  { key: "Esc", action: "Close / stop" },
];

/**
 * Global keyboard shortcuts hook.
 *
 * Mount once at the root layout level (via a `<KeyboardShortcutsProvider>` client component).
 * Shortcuts are suppressed when the active element is an input, textarea, or select.
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { disabled = false, onEmergencyStop, onToggleVoice, onEscape } = options;
  const router = useRouter();
  const spaceHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spaceConfirmed = useRef(false);
  const gChordActive = useRef(false);
  const gChordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isTyping = useCallback(() => {
    const tag = document.activeElement?.tagName.toLowerCase();
    const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
    return tag === "input" || tag === "textarea" || tag === "select" || isEditable;
  }, []);

  const clearGChord = useCallback(() => {
    gChordActive.current = false;
    if (gChordTimer.current) {
      clearTimeout(gChordTimer.current);
      gChordTimer.current = null;
    }
  }, []);

  const armGChord = useCallback(() => {
    gChordActive.current = true;
    if (gChordTimer.current) clearTimeout(gChordTimer.current);
    gChordTimer.current = setTimeout(clearGChord, G_CHORD_MS);
  }, [clearGChord]);

  const triggerEmergencyStop = useCallback(() => {
    try {
      const socket = getSocket();
      if (socket.connected) {
        socket.emit("robot_command", { action: "emergency_stop", robotId: null });
        toast.error("⛔ Emergency Stop sent — robot halted", {
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

      // G-chord second key (G then D / L / …)
      if (gChordActive.current) {
        clearGChord();
        switch (e.code) {
          case "KeyD":
            e.preventDefault();
            router.push("/");
            return;
          case "KeyL":
            e.preventDefault();
            router.push("/deliveries");
            return;
          default:
            return;
        }
      }

      // Ctrl/Cmd+B — toggle sidebar
      if (e.code === "KeyB" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        toggleSidebarCollapsed();
        return;
      }

      // G — arm go-to chord
      if (
        e.code === "KeyG" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault();
        armGChord();
        return;
      }

      switch (e.code) {
        case "Space": {
          e.preventDefault();
          if (spaceConfirmed.current) return;
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
            e.preventDefault();
            const lines = SHORTCUT_HELP.map(
              (s) => `${s.key.padEnd(14)} → ${s.action}`,
            ).join("  |  ");
            toast.info(`Keyboard shortcuts: ${lines}`, {
              duration: 8000,
              id: "shortcut-help",
            });
          }
          break;
        }

        case "Escape":
          clearGChord();
          onEscape?.();
          break;

        default:
          break;
      }
    },
    [
      disabled,
      isTyping,
      clearGChord,
      armGChord,
      triggerEmergencyStop,
      router,
      onToggleVoice,
      onEscape,
    ],
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
      if (gChordTimer.current) clearTimeout(gChordTimer.current);
    };
  }, [handleKeyDown, handleKeyUp]);

  return { shortcuts: SHORTCUT_HELP };
}
