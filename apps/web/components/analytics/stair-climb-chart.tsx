"use client";

/**
 * StairClimbChart — donut (success vs failure) + type breakdown bar chart.
 */

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
} from "recharts";
import type { StairClimbAnalytics } from "@/lib/api/analytics";
import { cn } from "@/lib/utils";

interface StatRowProps {
  label: string;
  value: string | number;
  color?: string;
}

function StatRow({ label, value, color }: StatRowProps) {
  return (
    <div className="flex items-center justify-between text-sm py-0.5">
      <div className="flex items-center gap-2">
        {color && <div className={cn("h-2.5 w-2.5 rounded-sm shrink-0", color)} />}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

interface Props {
  data: StairClimbAnalytics;
  className?: string;
}

export function StairClimbChart({ data, className }: Props) {
  const donutData = [
    { name: "Successful", value: data.successful_climbs, fill: "#10b981" },
    { name: "Failed", value: data.failed_climbs, fill: "#ef4444" },
  ];

  const typeData = [
    { type: "Standard", value: data.by_type.standard },
    { type: "Steep", value: data.by_type.steep },
    { type: "Shallow", value: data.by_type.shallow },
    { type: "Worn", value: data.by_type.worn },
  ];

  const successColor =
    data.success_rate >= 90
      ? "#10b981"
      : data.success_rate >= 80
        ? "#f59e0b"
        : "#ef4444";

  return (
    <div className={cn("space-y-4", className)}>
      {/* Donut ring */}
      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={62}
                dataKey="value"
                strokeWidth={0}
              >
                {donutData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, name: string) => [v, name]}
                contentStyle={{ fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span
              className="text-xl font-bold"
              style={{ color: successColor }}
            >
              {data.success_rate}%
            </span>
            <span className="text-[10px] text-muted-foreground">success</span>
          </div>
        </div>

        <div className="flex-1 space-y-1.5">
          <StatRow label="Total climbs" value={data.total_climbs} />
          <StatRow label="Successful" value={data.successful_climbs} color="bg-emerald-500" />
          <StatRow label="Failed" value={data.failed_climbs} color="bg-red-500" />
          <StatRow label="Arm deployments" value={data.arm_deployments} />
          <StatRow label="Track slips" value={data.track_slips} />
          <StatRow label="Avg / delivery" value={data.avg_climbs_per_delivery} />
        </div>
      </div>

      {/* Type breakdown */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Climbs by stair type</p>
        <ResponsiveContainer width="100%" height={160}>
          <RadarChart data={typeData} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
            <PolarGrid className="stroke-border" />
            <PolarAngleAxis dataKey="type" tick={{ fontSize: 11 }} />
            <Radar
              dataKey="value"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.25}
              strokeWidth={2}
            />
            <Tooltip contentStyle={{ fontSize: 12 }} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
