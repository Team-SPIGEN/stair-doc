"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ApiError } from "@/lib/api/robot-status";

interface UseApiOptions<T> {
  /** Auto-fetch on mount (default: true) */
  immediate?: boolean;
  /** Polling interval in ms (0 = no polling) */
  pollInterval?: number;
  /** Initial data to use before first fetch */
  initialData?: T;
}

interface UseApiReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Generic data-fetching hook for Stair-Doc API calls.
 *
 * @example
 * ```tsx
 * const { data, isLoading, error, refetch } = useApi(
 *   () => fetchAllRobotStatus(),
 *   { pollInterval: 5000 }
 * );
 * ```
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  options: UseApiOptions<T> = {},
): UseApiReturn<T> {
  const { immediate = true, pollInterval = 0, initialData } = options;

  const [data, setData] = useState<T | null>(initialData ?? null);
  const [isLoading, setIsLoading] = useState(immediate);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const execute = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcherRef.current();
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(
          err instanceof Error ? err.message : "An unknown error occurred",
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [immediate, execute]);

  // Polling
  useEffect(() => {
    if (pollInterval > 0) {
      intervalRef.current = setInterval(execute, pollInterval);
      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [pollInterval, execute]);

  return { data, isLoading, error, refetch: execute };
}
