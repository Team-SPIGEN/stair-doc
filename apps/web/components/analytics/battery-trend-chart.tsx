"use client";

/**
 * BatteryTrendChart — dual line chart showing Wh/delivery over time.
 * One line for base consumption, one dashed for stair-climb overhead.
 */

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";
import type { DailyWh } from "@/lib/api/analytics";

interface Props {
  data: DailyWh[];
  avgWh: number;
  stairOverheadPct: number;
  className?: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

export function BatteryTrendChart({ data, avgWh, stairOverheadPct, className }: Props) {
  const tickInterval = data.length > 30 ? Math.floor(data.length / 15) : 0;

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground px-1">
        <span>Avg: <strong className="text-foreground">{avgWh} Wh/delivery</strong></span>
        <span className="text-amber-500">⚡ +{stairOverheadPct}% stair overhead</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            interval={tickInterval}
            tick={{ fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 11 }} unit=" Wh" />
          <Tooltip
            labelFormatter={(l: string) => formatDate(l)}
            formatter={(v: number, name: string) => [`${v} Wh`, name]}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine
            y={avgWh}
            stroke="#3b82f6"
            strokeDasharray="4 2"
            label={{ value: "avg", position: "insideTopRight", fontSize: 10 }}
          />
          <Line
            type="monotone"
            dataKey="wh_per_delivery"
            name="Total Wh / delivery"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="stair_wh"
            name="Stair climb overhead"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
