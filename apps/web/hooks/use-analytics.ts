"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDeliveryAnalytics,
  fetchFloorAnalytics,
  fetchBatteryAnalytics,
  fetchStairAnalytics,
  fetchRFIDAnalytics,
  type DateRange,
  type DeliveryAnalytics,
  type FloorAnalytics,
  type BatteryAnalytics,
  type StairClimbAnalytics,
  type RFIDAnalytics,
} from "@/lib/api/analytics";

export interface AnalyticsData {
  delivery: DeliveryAnalytics | null;
  floors: FloorAnalytics | null;
  battery: BatteryAnalytics | null;
  stairs: StairClimbAnalytics | null;
  rfid: RFIDAnalytics | null;
}

export interface UseAnalyticsReturn {
  data: AnalyticsData;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

const EMPTY: AnalyticsData = {
  delivery: null,
  floors: null,
  battery: null,
  stairs: null,
  rfid: null,
};

/** Fetch all analytics endpoints in parallel and auto-refresh every 60 s. */
export function useAnalytics(days: DateRange): UseAnalyticsReturn {
  const [data, setData] = useState<AnalyticsData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const [delivery, floors, battery, stairs, rfid] = await Promise.all([
        fetchDeliveryAnalytics(days),
        fetchFloorAnalytics(days),
        fetchBatteryAnalytics(days),
        fetchStairAnalytics(days),
        fetchRFIDAnalytics(days),
      ]);
      setData({ delivery, floors, battery, stairs, rfid });
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  // Trigger load on mount + when days changes
  useEffect(() => {
    void load();
    // Auto-refresh every 60 s
    const interval = setInterval(() => void load(), 60_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [load]);

  return { data, isLoading, error, lastUpdated, refresh: load };
}
