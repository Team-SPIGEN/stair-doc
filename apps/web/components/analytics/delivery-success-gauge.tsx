"use client";

/**
 * DeliverySuccessGauge — radial bar chart showing success vs failure.
 * Includes a breakdown table by failure cause.
 */

import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { DeliveryStatusBreakdown } from "@/lib/api/analytics";
import { cn } from "@/lib/utils";

interface Props {
  successRate: number;
  total: number;
  byStatus: DeliveryStatusBreakdown;
  className?: string;
}

function RateRing({ rate }: { rate: number }) {
  const color =
    rate >= 90 ? "#10b981" : rate >= 80 ? "#f59e0b" : "#ef4444";

  const data = [
    { name: "background", value: 100, fill: "hsl(var(--muted))" },
    { name: "success", value: rate, fill: color },
  ];

  return (
    <ResponsiveContainer width="100%" height={180}>
      <RadialBarChart
        cx="50%"
        cy="50%"
        innerRadius="60%"
        outerRadius="85%"
        startAngle={225}
        endAngle={-45}
        data={data}
        barSize={16}
      >
        <RadialBar dataKey="value" cornerRadius={8} background={false} />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-foreground"
          style={{ fontSize: "1.6rem", fontWeight: 700 }}
        >
          {rate}%
        </text>
        <text
          x="50%"
          y="62%"
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: "0.7rem" }}
        >
          success rate
        </text>
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

function StatusRow({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", color)} />
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
      <span className="w-9 text-right text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function DeliverySuccessGauge({
  successRate,
  total,
  byStatus,
  className,
}: Props) {
  return (
    <div className={cn("space-y-4", className)}>
      <RateRing rate={successRate} />
      <div className="space-y-2 px-2">
        <StatusRow label="Completed" value={byStatus.completed} total={total} color="bg-emerald-500" />
        <StatusRow label="In Transit" value={byStatus.in_transit} total={total} color="bg-blue-500" />
        <StatusRow label="Failed" value={byStatus.failed} total={total} color="bg-red-500" />
        <StatusRow label="Cancelled" value={byStatus.cancelled} total={total} color="bg-yellow-500" />
      </div>
    </div>
  );
}
