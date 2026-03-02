/**
 * Analytics API client — wraps all /api/v1/analytics/* endpoints.
 */

import { OpenAPI } from "@/lib/api/client";

// ── Types ─────────────────────────────────────────────────────────────────

export type DateRange = 7 | 30 | 90;

export interface DailyDataPoint {
  date: string;
  count: number;
}

export interface DailyWh {
  date: string;
  wh_per_delivery: number;
  stair_wh: number;
}

export interface DeliveryStatusBreakdown {
  completed: number;
  failed: number;
  cancelled: number;
  in_transit: number;
}

export interface DeliveryAnalytics {
  total: number;
  success_rate: number;
  avg_time_seconds: number;
  avg_time_label: string;
  by_status: DeliveryStatusBreakdown;
  daily_trend: DailyDataPoint[];
}

export interface FloorUsage {
  floor: string;
  deliveries: number;
  success_rate: number;
  avg_time_seconds: number;
}

export interface FloorAnalytics {
  usage: FloorUsage[];
  heatmap: number[][];
}

export interface BatteryAnalytics {
  avg_wh_per_delivery: number;
  stair_overhead_pct: number;
  efficiency_trend: DailyWh[];
}

export interface StairTypeBreakdown {
  standard: number;
  steep: number;
  shallow: number;
  worn: number;
}

export interface StairClimbAnalytics {
  total_climbs: number;
  successful_climbs: number;
  failed_climbs: number;
  success_rate: number;
  avg_climbs_per_delivery: number;
  arm_deployments: number;
  track_slips: number;
  by_type: StairTypeBreakdown;
  daily_trend: DailyDataPoint[];
}

export interface HourlyRFIDPoint {
  hour: number;
  attempts: number;
  successes: number;
}

export interface RFIDAnalytics {
  total_scans: number;
  successful_scans: number;
  failed_scans: number;
  unauthorized_attempts: number;
  success_rate: number;
  false_positives: number;
  false_negatives: number;
  peak_hour: number;
  hourly_trend: HourlyRFIDPoint[];
}

export interface AnalyticsSummary {
  days: number;
  deliveries: { total: number; success_rate: number; avg_time_label: string };
  stairs: { total_climbs: number; success_rate: number; avg_per_delivery: number };
  battery: { avg_wh_per_delivery: number; stair_overhead_pct: number };
  rfid: { total_scans: number; success_rate: number; unauthorized_attempts: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function get<T>(path: string, days: DateRange): Promise<T> {
  const res = await fetch(`${OpenAPI.BASE}/api/v1${path}?days=${days}`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Analytics API error: ${res.status}`);
  const json = await res.json();
  return json.data as T;
}

// ── Exports ───────────────────────────────────────────────────────────────

export const fetchDeliveryAnalytics = (days: DateRange) =>
  get<DeliveryAnalytics>("/analytics/deliveries", days);

export const fetchFloorAnalytics = (days: DateRange) =>
  get<FloorAnalytics>("/analytics/floors", days);

export const fetchBatteryAnalytics = (days: DateRange) =>
  get<BatteryAnalytics>("/analytics/battery", days);

export const fetchStairAnalytics = (days: DateRange) =>
  get<StairClimbAnalytics>("/analytics/stairs", days);

export const fetchRFIDAnalytics = (days: DateRange) =>
  get<RFIDAnalytics>("/analytics/rfid", days);

export const fetchAnalyticsSummary = (days: DateRange) =>
  get<AnalyticsSummary>("/analytics/summary", days);

// ── CSV Export ────────────────────────────────────────────────────────────

export type ExportType = "deliveries" | "stairs" | "battery" | "rfid";

/** Build a CSV string from an array of objects and trigger browser download. */
export function exportCSV(
  filename: string,
  rows: Record<string, string | number>[],
): void {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => JSON.stringify(r[h] ?? "")).join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
