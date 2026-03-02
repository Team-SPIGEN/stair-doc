"use client";

import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Activity,
  Zap,
  CreditCard,
  RefreshCw,
  Download,
  TrendingUp,
  Clock,
  BarChart2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DateRangePicker } from "@/components/analytics/date-range-picker";
import { DeliveryTrendChart } from "@/components/analytics/delivery-trend-chart";
import { DeliverySuccessGauge } from "@/components/analytics/delivery-success-gauge";
import { FloorHeatmap } from "@/components/analytics/floor-heatmap";
import { BatteryTrendChart } from "@/components/analytics/battery-trend-chart";
import { StairClimbChart } from "@/components/analytics/stair-climb-chart";
import { RFIDAnalyticsChart } from "@/components/analytics/rfid-analytics-chart";
import { useAnalytics } from "@/hooks/use-analytics";
import { exportCSV, type DateRange } from "@/lib/api/analytics";
import { cn } from "@/lib/utils";

// ── KPI Card ──────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: number; positive: boolean };
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4 sm:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-20" />
          ) : (
            <p className="text-2xl font-bold tabular-nums">{value}</p>
          )}
          {sub && (
            <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
          )}
          {trend && (
            <p
              className={cn(
                "text-xs mt-0.5 font-medium",
                trend.positive ? "text-emerald-500" : "text-red-500",
              )}
            >
              {trend.positive ? "▲" : "▼"} {Math.abs(trend.value)}%
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [days, setDays] = useState<DateRange>(30);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const { data, isLoading, error, lastUpdated, refresh } = useAnalytics(days);

  const handleDaysChange = useCallback((d: DateRange) => {
    setDays(d);
    setSelectedFloor(null);
  }, []);

  const handleFloorClick = useCallback((floor: string) => {
    setSelectedFloor((prev) => (prev === floor ? null : floor));
  }, []);

  // CSV export helpers
  const handleExportDeliveries = () => {
    if (!data.delivery) return;
    exportCSV(
      `stairdoc-deliveries-${days}d.csv`,
      data.delivery.daily_trend.map((d) => ({ date: d.date, deliveries: d.count })),
    );
  };

  const handleExportBattery = () => {
    if (!data.battery) return;
    exportCSV(
      `stairdoc-battery-${days}d.csv`,
      data.battery.efficiency_trend.map((d) => ({
        date: d.date,
        wh_per_delivery: d.wh_per_delivery,
        stair_overhead_wh: d.stair_wh,
      })),
    );
  };

  const handleExportStairs = () => {
    if (!data.stairs) return;
    exportCSV(
      `stairdoc-stairs-${days}d.csv`,
      data.stairs.daily_trend.map((d) => ({ date: d.date, climbs: d.count })),
    );
  };

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        icon={BarChart2}
        title="Robot Performance Analytics"
        description={`Stair-climbing delivery metrics · ${days}-day window${selectedFloor ? ` · Floor ${selectedFloor} only` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {lastUpdated && (
              <span className="hidden text-xs text-white/70 sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <DateRangePicker value={days} onChange={handleDaysChange} />
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              className="gap-1.5 bg-white/20 hover:bg-white/30 text-white border-white/30"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Failed to load analytics: {error}
        </div>
      )}

      {/* ── Row 1: KPI summary cards ──────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Package}
          label="Total Deliveries"
          value={data.delivery?.total ?? "—"}
          sub={`${data.delivery?.avg_time_label ?? "—"} avg time`}
          loading={isLoading}
        />
        <KpiCard
          icon={TrendingUp}
          label="Success Rate"
          value={data.delivery ? `${data.delivery.success_rate}%` : "—"}
          sub={`${data.delivery?.by_status.failed ?? 0} failures`}
          trend={
            data.delivery
              ? {
                  value: Math.abs(data.delivery.success_rate - 90),
                  positive: data.delivery.success_rate >= 90,
                }
              : undefined
          }
          loading={isLoading}
        />
        <KpiCard
          icon={Activity}
          label="Stair Climbs"
          value={data.stairs?.total_climbs ?? "—"}
          sub={`${data.stairs?.success_rate ?? "—"}% climb success`}
          loading={isLoading}
        />
        <KpiCard
          icon={Zap}
          label="Avg Battery / Delivery"
          value={data.battery ? `${data.battery.avg_wh_per_delivery} Wh` : "—"}
          sub={`+${data.battery?.stair_overhead_pct ?? 0}% stair overhead`}
          loading={isLoading}
        />
      </div>

      {/* ── Row 2: Delivery trend + success gauge ─────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle className="text-base">Delivery Trend</CardTitle>
              <CardDescription>Daily volume over {days} days</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={handleExportDeliveries}
              disabled={!data.delivery}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading || !data.delivery ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <DeliveryTrendChart data={data.delivery.daily_trend} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">Success Rate</CardTitle>
            <CardDescription>Deliveries by outcome</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading || !data.delivery ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <DeliverySuccessGauge
                successRate={data.delivery.success_rate}
                total={data.delivery.total}
                byStatus={data.delivery.by_status}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Floor heatmap + battery ────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">Floor Usage Heatmap</CardTitle>
            <CardDescription>
              Click a floor to filter · {selectedFloor ? `Floor ${selectedFloor} selected` : "All floors"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading || !data.floors ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <FloorHeatmap
                usage={data.floors.usage}
                heatmap={data.floors.heatmap}
                onFloorClick={handleFloorClick}
                selectedFloor={selectedFloor}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle className="text-base">Battery Efficiency</CardTitle>
              <CardDescription>Wh per delivery · stair vs base</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={handleExportBattery}
              disabled={!data.battery}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading || !data.battery ? (
              <Skeleton className="h-[280px] w-full" />
            ) : (
              <BatteryTrendChart
                data={data.battery.efficiency_trend}
                avgWh={data.battery.avg_wh_per_delivery}
                stairOverheadPct={data.battery.stair_overhead_pct}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 4: Stair climbing + RFID ──────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-4">
            <div>
              <CardTitle className="text-base">Stair-Climbing Analytics</CardTitle>
              <CardDescription>Actuator reliability · climb types</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={handleExportStairs}
              disabled={!data.stairs}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading || !data.stairs ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <StairClimbChart data={data.stairs} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-4">
            <CardTitle className="text-base">RFID Performance</CardTitle>
            <CardDescription>Scan success · hourly distribution</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading || !data.rfid ? (
              <Skeleton className="h-[320px] w-full" />
            ) : (
              <RFIDAnalyticsChart data={data.rfid} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Footer: export + insights ─────────────────────────────────── */}
      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium">Admin Insights</p>
            <div className="flex flex-wrap gap-2">
              {data.delivery && data.delivery.success_rate < 90 && (
                <Badge variant="destructive" className="text-xs">
                  ⚠ Success rate below 90% threshold
                </Badge>
              )}
              {data.stairs && data.stairs.track_slips > 5 && (
                <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/40">
                  ⚡ {data.stairs.track_slips} track slips detected — inspect treads
                </Badge>
              )}
              {data.rfid && data.rfid.unauthorized_attempts > 0 && (
                <Badge variant="outline" className="text-xs text-red-500 border-red-500/40">
                  🔒 {data.rfid.unauthorized_attempts} unauthorised RFID attempts
                </Badge>
              )}
              {data.delivery &&
                data.stairs &&
                data.rfid &&
                data.delivery.success_rate >= 90 &&
                data.stairs.track_slips <= 5 &&
                data.rfid.unauthorized_attempts === 0 && (
                  <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/40">
                    ✅ All systems operating within normal thresholds
                  </Badge>
                )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                handleExportDeliveries();
                handleExportBattery();
                handleExportStairs();
              }}
              disabled={!data.delivery || !data.battery || !data.stairs}
            >
              <Download className="h-4 w-4" />
              Export All CSV
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
