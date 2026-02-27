"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RobotStatusResponse } from "@/lib/api/robot-status";
import { MapPin } from "lucide-react";

// ── Status → dot color mapping ──────────────────────────────────────────

const DOT_COLOR: Record<string, string> = {
  idle: "fill-slate-400",
  climbing: "fill-amber-500",
  descending: "fill-sky-500",
  delivering: "fill-blue-500",
  returning: "fill-indigo-500",
  charging: "fill-emerald-500",
  maintenance: "fill-orange-500",
  emergency: "fill-red-600",
  offline: "fill-gray-400",
};

const RING_COLOR: Record<string, string> = {
  idle: "stroke-slate-400/40",
  climbing: "stroke-amber-500/40",
  descending: "stroke-sky-500/40",
  delivering: "stroke-blue-500/40",
  returning: "stroke-indigo-500/40",
  charging: "stroke-emerald-500/40",
  maintenance: "stroke-orange-500/40",
  emergency: "stroke-red-600/50",
  offline: "stroke-gray-400/40",
};

// ── Simple "office floor plan" SVG ──────────────────────────────────────

interface LocationMapProps {
  robots: RobotStatusResponse[];
  selectedRobotId?: string | null;
  onSelectRobot?: (robotId: string) => void;
  className?: string;
}

/**
 * A simple SVG floor-plan map showing robot positions.
 *
 * Robots are plotted using `location.x` (0-100) and `location.y` (0-100)
 * coordinates returned from the backend.
 */
export function LocationMap({
  robots,
  selectedRobotId,
  onSelectRobot,
  className,
}: LocationMapProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            <MapPin className="mr-2 inline h-4 w-4" />
            Floor Map
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {robots.length} robot{robots.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-3">
        <svg
          viewBox="0 0 400 300"
          className="w-full rounded-lg border bg-muted/30"
          style={{ maxHeight: 320 }}
        >
          {/* ── Background Grid ──────────────────────────────── */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="0.3"
                className="text-muted-foreground/20"
              />
            </pattern>
          </defs>
          <rect width="400" height="300" fill="url(#grid)" />

          {/* ── Building outlines (simplified office layout) ── */}
          {/* Main corridor */}
          <rect x="30" y="40" width="340" height="220" rx="6" ry="6"
            fill="none" stroke="currentColor" strokeWidth="1.5"
            className="text-muted-foreground/30" />

          {/* Rooms along top */}
          <rect x="30" y="40" width="80" height="70" rx="3"
            fill="currentColor" className="text-muted-foreground/5"
            stroke="currentColor" strokeWidth="0.8" />
          <text x="70" y="80" textAnchor="middle" className="fill-muted-foreground text-[8px]">
            Room A
          </text>

          <rect x="120" y="40" width="80" height="70" rx="3"
            fill="currentColor" className="text-muted-foreground/5"
            stroke="currentColor" strokeWidth="0.8" />
          <text x="160" y="80" textAnchor="middle" className="fill-muted-foreground text-[8px]">
            Room B
          </text>

          <rect x="210" y="40" width="80" height="70" rx="3"
            fill="currentColor" className="text-muted-foreground/5"
            stroke="currentColor" strokeWidth="0.8" />
          <text x="250" y="80" textAnchor="middle" className="fill-muted-foreground text-[8px]">
            Room C
          </text>

          <rect x="300" y="40" width="70" height="70" rx="3"
            fill="currentColor" className="text-muted-foreground/5"
            stroke="currentColor" strokeWidth="0.8" />
          <text x="335" y="80" textAnchor="middle" className="fill-muted-foreground text-[8px]">
            Room D
          </text>

          {/* Rooms along bottom */}
          <rect x="30" y="190" width="100" height="70" rx="3"
            fill="currentColor" className="text-muted-foreground/5"
            stroke="currentColor" strokeWidth="0.8" />
          <text x="80" y="230" textAnchor="middle" className="fill-muted-foreground text-[8px]">
            Dock
          </text>

          <rect x="150" y="190" width="100" height="70" rx="3"
            fill="currentColor" className="text-muted-foreground/5"
            stroke="currentColor" strokeWidth="0.8" />
          <text x="200" y="230" textAnchor="middle" className="fill-muted-foreground text-[8px]">
            Lobby
          </text>

          <rect x="270" y="190" width="100" height="70" rx="3"
            fill="currentColor" className="text-muted-foreground/5"
            stroke="currentColor" strokeWidth="0.8" />
          <text x="320" y="230" textAnchor="middle" className="fill-muted-foreground text-[8px]">
            Stairs
          </text>

          {/* Staircase icon */}
          <g transform="translate(305, 210)">
            <line x1="0" y1="0" x2="30" y2="0" stroke="currentColor" strokeWidth="0.8" className="text-muted-foreground/50" />
            <line x1="0" y1="5" x2="25" y2="5" stroke="currentColor" strokeWidth="0.8" className="text-muted-foreground/50" />
            <line x1="0" y1="10" x2="20" y2="10" stroke="currentColor" strokeWidth="0.8" className="text-muted-foreground/50" />
            <line x1="0" y1="15" x2="15" y2="15" stroke="currentColor" strokeWidth="0.8" className="text-muted-foreground/50" />
          </g>

          {/* Corridor label */}
          <text x="200" y="155" textAnchor="middle" className="fill-muted-foreground/40 text-[10px] font-medium">
            CORRIDOR
          </text>

          {/* ── Robot Dots ───────────────────────────────────── */}
          {robots.map((robot) => {
            // Map 0-100 coordinates to SVG viewBox (30-370 x, 40-260 y)
            const cx = 30 + (robot.location.x / 100) * 340;
            const cy = 40 + (robot.location.y / 100) * 220;
            const isSelected = robot.id === selectedRobotId;
            const dotColor = DOT_COLOR[robot.status] ?? DOT_COLOR.offline;
            const ringColor = RING_COLOR[robot.status] ?? RING_COLOR.offline;

            return (
              <g
                key={robot.id}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectRobot?.(robot.id);
                }}
              >
                {/* Outer pulse ring for active robots */}
                {["delivering", "climbing", "descending", "returning"].includes(robot.status) && (
                  <circle cx={cx} cy={cy} r="12" fill="none" strokeWidth="1.5"
                    className={cn(ringColor, "animate-ping")} />
                )}

                {/* Selection ring */}
                {isSelected && (
                  <circle cx={cx} cy={cy} r="14" fill="none" strokeWidth="2"
                    className="stroke-primary" />
                )}

                {/* Robot dot */}
                <circle cx={cx} cy={cy} r="7" className={dotColor} />

                {/* Inner white circle for contrast */}
                <circle cx={cx} cy={cy} r="3" className="fill-white dark:fill-background" />

                {/* Label */}
                <text
                  x={cx}
                  y={cy - 12}
                  textAnchor="middle"
                  className={cn(
                    "text-[7px] font-medium",
                    isSelected ? "fill-primary" : "fill-muted-foreground",
                  )}
                >
                  {robot.name.replace("StairBot ", "")}
                </text>

                {/* Floor badge */}
                <text
                  x={cx}
                  y={cy + 18}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[6px]"
                >
                  F{robot.location.floor}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {[
            { label: "Delivering", color: "bg-blue-500" },
            { label: "Climbing", color: "bg-amber-500" },
            { label: "Charging", color: "bg-emerald-500" },
            { label: "Idle", color: "bg-slate-400" },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-full", item.color)} />
              {item.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
