/**
 * Joystick — Virtual joystick component backed by nipplejs.
 *
 * Maps 8-directional input (angle ranges) to navigation commands,
 * with a 5% deadzone and distance → speed (0.1–1.0) scaling.
 * Fires `onCommand` on move and sends "stop" on release.
 */
"use client";

import { useRef, useEffect, useCallback } from "react";
import type { JoystickManager, EventData, JoystickOutputData } from "nipplejs";
import type { NavigationCommand } from "@/lib/api/navigation";

// ── Direction mapping (8-way) ───────────────────────────────────────────

function angleToCommand(angleDeg: number): NavigationCommand {
  // nipplejs angle: 0° = right, 90° = up, 180° = left, 270° = down
  const a = ((angleDeg % 360) + 360) % 360;

  if (a >= 337.5 || a < 22.5) return "right";
  if (a >= 22.5 && a < 67.5) return "forward"; // up-right → forward
  if (a >= 67.5 && a < 112.5) return "forward";
  if (a >= 112.5 && a < 157.5) return "forward"; // up-left → forward
  if (a >= 157.5 && a < 202.5) return "left";
  if (a >= 202.5 && a < 247.5) return "backward"; // down-left → backward
  if (a >= 247.5 && a < 292.5) return "backward";
  if (a >= 292.5 && a < 337.5) return "backward"; // down-right → backward
  return "stop";
}

function distanceToSpeed(distance: number, maxDistance: number): number {
  const ratio = Math.min(distance / maxDistance, 1);
  const DEADZONE = 0.05;
  if (ratio < DEADZONE) return 0;
  // Map [DEADZONE..1] → [0.1..1.0]
  return 0.1 + (ratio - DEADZONE) / (1 - DEADZONE) * 0.9;
}

// ── Component ───────────────────────────────────────────────────────────

interface JoystickProps {
  /** Fired on every move or release with command + speed. */
  onCommand: (command: NavigationCommand, speed: number) => void;
  /** Size of the joystick zone in CSS pixels (default: 200). */
  size?: number;
  /** Whether the joystick is disabled (e.g. emergency stop active). */
  disabled?: boolean;
}

export function Joystick({
  onCommand,
  size = 200,
  disabled = false,
}: JoystickProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<JoystickManager | null>(null);
  const onCommandRef = useRef(onCommand);

  useEffect(() => {
    onCommandRef.current = onCommand;
  }, [onCommand]);

  const cleanup = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.destroy();
      managerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (disabled || !containerRef.current) {
      cleanup();
      return;
    }

    let cancelled = false;

    async function init() {
      const nipplejs = (await import("nipplejs")).default;
      if (cancelled || !containerRef.current) return;

      const manager = nipplejs.create({
        zone: containerRef.current,
        mode: "static",
        position: { left: "50%", top: "50%" },
        size,
        color: "rgba(255, 255, 255, 0.25)",
        lockX: false,
        lockY: false,
        restOpacity: 0.6,
        fadeTime: 150,
      });

      managerRef.current = manager;

      const handleMove = (_evt: EventData, data: JoystickOutputData) => {
        const cmd = angleToCommand(data.angle.degree);
        const speed = distanceToSpeed(data.distance, size / 2);
        if (speed > 0) {
          onCommandRef.current(cmd, parseFloat(speed.toFixed(2)));
        }
      };

      const handleEnd = () => {
        onCommandRef.current("stop", 0);
      };

      manager.on("move", handleMove);
      manager.on("end", handleEnd);
    }

    init();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [disabled, size, cleanup]);

  return (
    <div className="relative flex flex-col items-center gap-2">
      <div
        ref={containerRef}
        className="relative touch-none select-none"
        style={{ width: size, height: size }}
      >
        {disabled && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-full bg-black/50">
            <span className="text-xs font-medium text-red-400">DISABLED</span>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {disabled ? "Emergency stop active" : "Drag to move robot"}
      </p>
    </div>
  );
}
