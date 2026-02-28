"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Filter,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchRFIDLogs,
  type RFIDLogEntry,
  type RFIDScanType,
  type FetchRFIDLogsParams,
} from "@/lib/api/rfid";

// ── Types ────────────────────────────────────────────────────────────────

interface RFIDTableProps {
  className?: string;
  /** Initial logs passed from parent (e.g., after SSR fetch or Socket event) */
  initialLogs?: RFIDLogEntry[];
  /** Live log entries pushed via Socket.IO */
  liveLogs?: RFIDLogEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getScanTypeBadge(scanType: RFIDScanType) {
  const map: Record<RFIDScanType, { label: string; variant: "default" | "secondary" | "destructive" | "success" | "warning" | "info" }> = {
    checkpoint: { label: "Checkpoint", variant: "secondary" },
    pickup: { label: "Pickup", variant: "info" },
    dropoff: { label: "Dropoff", variant: "info" },
    unlock: { label: "Unlock", variant: "success" },
    denied: { label: "Denied", variant: "destructive" },
  };
  const entry = map[scanType] ?? { label: scanType, variant: "secondary" as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Component ────────────────────────────────────────────────────────────

export function RFIDTable({
  className,
  initialLogs,
  liveLogs = [],
}: RFIDTableProps) {
  const [logs, setLogs] = useState<RFIDLogEntry[]>(initialLogs ?? []);
  const [isLoading, setIsLoading] = useState(!initialLogs);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<RFIDScanType | "all">("all");
  const [showFilters, setShowFilters] = useState(false);

  // Merge live logs into the existing list (prepend, de-duplicate)
  useEffect(() => {
    if (liveLogs.length === 0) return;
    setLogs((prev) => {
      const existingIds = new Set(prev.map((l) => l.id));
      const newEntries = liveLogs.filter((l) => !existingIds.has(l.id));
      return [...newEntries, ...prev];
    });
  }, [liveLogs]);

  const loadLogs = useCallback(async (params?: FetchRFIDLogsParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchRFIDLogs(params);
      setLogs(data.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!initialLogs) {
      loadLogs();
    }
  }, [initialLogs, loadLogs]);

  const handleFilterChange = (type: RFIDScanType | "all") => {
    setFilterType(type);
    if (type === "all") {
      loadLogs();
    } else {
      loadLogs({ scan_type: type });
    }
  };

  const displayLogs = logs;

  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <div>
          <h3 className="font-semibold text-lg">Access Logs</h3>
          <p className="text-xs text-muted-foreground">
            {logs.length} record{logs.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFilters((v) => !v)}
            className="h-8 w-8"
          >
            <Filter className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => loadLogs(filterType !== "all" ? { scan_type: filterType } : undefined)}
            disabled={isLoading}
            className="h-8 w-8"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* ── Filters ─────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 border-b px-4 py-3 sm:px-6">
          {(["all", "unlock", "denied", "checkpoint", "pickup", "dropoff"] as const).map(
            (type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleFilterChange(type)}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs transition-colors",
                  filterType === type
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                {type === "all" ? "All" : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ),
          )}
        </div>
      )}

      {/* ── Table / List ────────────────────────────────────────────── */}
      <div className="max-h-[500px] overflow-y-auto">
        {error && (
          <div className="px-4 py-8 text-center text-sm text-red-500 sm:px-6">
            {error}
          </div>
        )}

        {isLoading && logs.length === 0 && (
          <div className="space-y-3 px-4 py-4 sm:px-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`skel-${i}`} className="h-14 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {!isLoading && logs.length === 0 && !error && (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-6">
            No access logs found.
          </div>
        )}

        {displayLogs.length > 0 && (
          <>
            {/* Desktop table header */}
            <div className="hidden sm:grid sm:grid-cols-[1fr_1fr_120px_100px_1fr_100px] gap-2 border-b bg-muted/50 px-6 py-2 text-xs font-medium text-muted-foreground">
              <span>Tag / User</span>
              <span>Robot</span>
              <span>Type</span>
              <span>Status</span>
              <span>Message</span>
              <span className="text-right">Time</span>
            </div>

            {displayLogs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  "border-b px-4 py-3 transition-colors last:border-0 hover:bg-muted/30 sm:px-6",
                  // Mobile: stack; Desktop: grid row
                  "sm:grid sm:grid-cols-[1fr_1fr_120px_100px_1fr_100px] sm:items-center sm:gap-2",
                )}
              >
                {/* Tag / User */}
                <div className="mb-1 sm:mb-0">
                  <p className="text-sm font-medium">{log.tag_id}</p>
                  {log.user_name && (
                    <p className="text-xs text-muted-foreground">{log.user_name}</p>
                  )}
                </div>

                {/* Robot + Delivery */}
                <div className="mb-1 sm:mb-0">
                  <p className="text-sm">{log.robot_id}</p>
                  {log.delivery_id && (
                    <p className="text-xs text-muted-foreground">{log.delivery_id}</p>
                  )}
                </div>

                {/* Scan type */}
                <div className="mb-1 sm:mb-0">
                  {getScanTypeBadge(log.scan_type)}
                </div>

                {/* Auth status */}
                <div className="mb-1 sm:mb-0">
                  {log.authorized ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Granted
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-red-500">
                      <ShieldX className="h-3.5 w-3.5" />
                      Denied
                    </span>
                  )}
                </div>

                {/* Message */}
                <p className="mb-1 text-xs text-muted-foreground sm:mb-0">
                  {log.message}
                </p>

                {/* Timestamp */}
                <p className="text-xs text-muted-foreground sm:text-right">
                  {formatTimestamp(log.timestamp)}
                </p>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
