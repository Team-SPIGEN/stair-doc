"use client";

/**
 * RFIDAnalyticsChart — hourly usage area chart + summary stats.
 */

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { RFIDAnalytics } from "@/lib/api/analytics";
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldX, Clock, AlertTriangle } from "lucide-react";

function StatChip({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  variant?: "default" | "success" | "danger" | "warning";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border p-3",
        variant === "success" && "border-emerald-500/20 bg-emerald-500/5",
        variant === "danger" && "border-red-500/20 bg-red-500/5",
        variant === "warning" && "border-amber-500/20 bg-amber-500/5",
        variant === "default" && "bg-muted/40",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          variant === "success" && "text-emerald-500",
          variant === "danger" && "text-red-500",
          variant === "warning" && "text-amber-500",
          variant === "default" && "text-muted-foreground",
        )}
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

interface Props {
  data: RFIDAnalytics;
  className?: string;
}

export function RFIDAnalyticsChart({ data, className }: Props) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Key stats grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatChip
          icon={ShieldCheck}
          label="Success rate"
          value={`${data.success_rate}%`}
          variant={data.success_rate >= 95 ? "success" : data.success_rate >= 85 ? "warning" : "danger"}
        />
        <StatChip
          icon={ShieldX}
          label="Failed scans"
          value={data.failed_scans}
          variant={data.failed_scans === 0 ? "success" : "danger"}
        />
        <StatChip
          icon={AlertTriangle}
          label="Unauthorised"
          value={data.unauthorized_attempts}
          variant={data.unauthorized_attempts === 0 ? "success" : "warning"}
        />
        <StatChip
          icon={Clock}
          label="Peak hour"
          value={`${String(data.peak_hour).padStart(2, "0")}:00`}
          variant="default"
        />
      </div>

      {/* Hourly trend */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Hourly scan distribution</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart
            data={data.hourly_trend}
            margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
          >
            <defs>
              <linearGradient id="rfidAttempts" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rfidSuccesses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="hour"
              tickFormatter={(h: number) => `${String(h).padStart(2, "0")}h`}
              interval={3}
              tick={{ fontSize: 11 }}
            />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              labelFormatter={(h: number) => `${String(h).padStart(2, "0")}:00`}
              contentStyle={{ fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="attempts"
              name="Attempts"
              stroke="#3b82f6"
              fill="url(#rfidAttempts)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="successes"
              name="Successes"
              stroke="#10b981"
              fill="url(#rfidSuccesses)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
