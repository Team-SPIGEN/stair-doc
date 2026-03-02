"use client";

/**
 * DeliveryTrendChart — line chart of daily delivery counts.
 * Also includes a bar overlay for failures.
 */

import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { DailyDataPoint } from "@/lib/api/analytics";

interface Props {
  data: DailyDataPoint[];
  className?: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

export function DeliveryTrendChart({ data, className }: Props) {
  // Show at most 30 labels — thin out x-axis for >30d
  const tickInterval = data.length > 30 ? Math.floor(data.length / 15) : 0;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            interval={tickInterval}
            tick={{ fontSize: 11 }}
            className="text-muted-foreground"
          />
          <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
          <Tooltip
            formatter={(v: number, name: string) => [v, name]}
            labelFormatter={(l: string) => formatDate(l)}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="count" name="Deliveries" fill="#3b82f6" radius={[3, 3, 0, 0]} opacity={0.7} />
          <Line
            type="monotone"
            dataKey="count"
            name="Trend"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
