"use client";

/**
 * FloorHeatmap — 5×4 heat grid (floors G-4 × 4 time buckets) plus
 * a horizontal bar chart of deliveries per floor.
 */

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import type { FloorUsage } from "@/lib/api/analytics";
import { cn } from "@/lib/utils";

// ── Color scale ────────────────────────────────────────────────────────────

function heatColor(value: number): string {
  // 0 → green, 0.5 → yellow, 1 → red
  if (value < 0.33) return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400";
  if (value < 0.66) return "bg-yellow-500/30 text-yellow-700 dark:text-yellow-400";
  return "bg-red-500/25 text-red-700 dark:text-red-400";
}

const TIME_LABELS = ["00–06", "06–12", "12–18", "18–24"];
const FLOORS = ["G", "1", "2", "3", "4"];

interface HeatmapProps {
  heatmap: number[][];
  onFloorClick?: (floor: string) => void;
  selectedFloor?: string | null;
}

function HeatGrid({ heatmap, onFloorClick, selectedFloor }: HeatmapProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className="w-8 text-left text-muted-foreground pb-2">Floor</th>
            {TIME_LABELS.map((t) => (
              <th key={t} className="pb-2 text-center text-muted-foreground font-normal">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FLOORS.map((floor, fi) => (
            <tr key={floor}>
              <td className="pr-2 py-1 font-semibold text-foreground">F{floor}</td>
              {(heatmap[fi] ?? []).map((val, ci) => (
                <td key={ci} className="py-1 px-1">
                  <button
                    onClick={() => onFloorClick?.(floor)}
                    className={cn(
                      "w-full h-10 rounded-lg transition-all flex items-center justify-center text-xs font-medium",
                      heatColor(val),
                      selectedFloor === floor && "ring-2 ring-primary ring-offset-1",
                    )}
                    title={`Floor ${floor} | ${TIME_LABELS[ci]}: ${Math.round(val * 100)}% utilisation`}
                  >
                    {Math.round(val * 100)}%
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  usage: FloorUsage[];
  heatmap: number[][];
  onFloorClick?: (floor: string) => void;
  selectedFloor?: string | null;
  className?: string;
}

const FLOOR_COLORS = ["#6366f1", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b"];

export function FloorHeatmap({
  usage,
  heatmap,
  onFloorClick,
  selectedFloor,
  className,
}: Props) {
  return (
    <div className={cn("space-y-4", className)}>
      <HeatGrid heatmap={heatmap} onFloorClick={onFloorClick} selectedFloor={selectedFloor} />
      <ResponsiveContainer width="100%" height={160}>
        <BarChart
          data={usage}
          layout="vertical"
          margin={{ top: 0, right: 8, left: 12, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-border" />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            dataKey="floor"
            type="category"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: string) => `F${v}`}
            width={28}
          />
          <Tooltip
            formatter={(v: number, _n: string, props: { payload?: FloorUsage }) => [
              `${v} deliveries (${props.payload?.success_rate ?? 0}% success)`,
              `Floor ${props.payload?.floor ?? ""}`,
            ]}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="deliveries" radius={[0, 4, 4, 0]}>
            {usage.map((_, i) => (
              <Cell
                key={i}
                fill={FLOOR_COLORS[i % FLOOR_COLORS.length]}
                opacity={selectedFloor == null || selectedFloor === usage[i]?.floor ? 1 : 0.35}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
