"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

export type SyncStatus = "synced" | "syncing" | "offline" | "error";

export type QueuedActionType =
  | "create_delivery"
  | "update_delivery"
  | "cancel_delivery"
  | "send_robot_command"
  | "rfid_verify";

export interface QueuedAction {
  id: string;
  type: QueuedActionType;
  payload: Record<string, unknown>;
  timestamp: string;
  retries: number;
}

export interface UseOfflineQueueReturn {
  isOnline: boolean;
  syncStatus: SyncStatus;
  queue: QueuedAction[];
  queueCount: number;
  /** Add an action to the offline queue; returns the queued action id */
  enqueue: (type: QueuedActionType, payload: Record<string, unknown>) => string;
  /** Remove a successfully synced action from the queue */
  dequeue: (id: string) => void;
  /** Manually trigger a sync attempt */
  syncNow: () => Promise<void>;
  clearQueue: () => void;
}

// ── Storage helpers ────────────────────────────────────────────────────────

const STORAGE_KEY = "stairdoc:offline-queue";

function loadQueue(): QueuedAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedAction[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch { /* storage full — non-fatal */ }
}

// ── Action executor ────────────────────────────────────────────────────────
// Maps queued action types to their fetch calls.
// Extend this as more endpoints are added.

async function executeAction(action: QueuedAction): Promise<boolean> {
  const base =
    typeof window !== "undefined"
      ? (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
      : "http://localhost:8000";

  const headers = { "Content-Type": "application/json" };

  try {
    switch (action.type) {
      case "create_delivery": {
        const res = await fetch(`${base}/api/v1/deliveries`, {
          method: "POST",
          headers,
          body: JSON.stringify(action.payload),
        });
        return res.ok;
      }

      case "update_delivery": {
        const { id, ...rest } = action.payload as { id: string } & Record<string, unknown>;
        const res = await fetch(`${base}/api/v1/deliveries/${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(rest),
        });
        return res.ok;
      }

      case "cancel_delivery": {
        const { id } = action.payload as { id: string };
        const res = await fetch(`${base}/api/v1/deliveries/${id}/cancel`, {
          method: "POST",
          headers,
          body: JSON.stringify(action.payload),
        });
        return res.ok;
      }

      case "send_robot_command": {
        const { robot_id, ...cmd } = action.payload as {
          robot_id: string;
        } & Record<string, unknown>;
        const res = await fetch(`${base}/api/v1/robots/${robot_id}/command`, {
          method: "POST",
          headers,
          body: JSON.stringify(cmd),
        });
        return res.ok;
      }

      case "rfid_verify": {
        const res = await fetch(`${base}/api/v1/rfid/verify`, {
          method: "POST",
          headers,
          body: JSON.stringify(action.payload),
        });
        return res.ok;
      }

      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────

const MAX_RETRIES = 5;

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "synced",
  );
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const isSyncing = useRef(false);

  // Load persisted queue on mount
  useEffect(() => {
    setQueue(loadQueue());
  }, []);

  // Track online / offline events
  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setSyncStatus("synced"); // will be updated by syncNow
    }
    function handleOffline() {
      setIsOnline(false);
      setSyncStatus("offline");
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && queue.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      syncNow();
    }
    // syncNow is stable (useCallback with no deps) — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const enqueue = useCallback(
    (type: QueuedActionType, payload: Record<string, unknown>): string => {
      const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const action: QueuedAction = {
        id,
        type,
        payload,
        timestamp: new Date().toISOString(),
        retries: 0,
      };
      setQueue((prev) => {
        const next = [...prev, action];
        saveQueue(next);
        return next;
      });
      return id;
    },
    [],
  );

  const dequeue = useCallback((id: string) => {
    setQueue((prev) => {
      const next = prev.filter((a) => a.id !== id);
      saveQueue(next);
      return next;
    });
  }, []);

  const syncNow = useCallback(async (): Promise<void> => {
    if (isSyncing.current || !navigator.onLine) return;

    const pending = loadQueue();
    if (pending.length === 0) {
      setSyncStatus("synced");
      return;
    }

    isSyncing.current = true;
    setSyncStatus("syncing");

    const remaining: QueuedAction[] = [];
    let hasError = false;

    for (const action of pending) {
      const ok = await executeAction(action);
      if (ok) {
        // Successfully synced — don't keep in queue
        continue;
      }
      // Failed — increment retries
      const updated: QueuedAction = { ...action, retries: action.retries + 1 };
      if (updated.retries < MAX_RETRIES) {
        remaining.push(updated);
        hasError = true;
      }
      // Drop actions that exceeded MAX_RETRIES
    }

    saveQueue(remaining);
    setQueue(remaining);
    isSyncing.current = false;
    setSyncStatus(hasError ? "error" : "synced");
  }, []);

  const clearQueue = useCallback(() => {
    saveQueue([]);
    setQueue([]);
    setSyncStatus("synced");
  }, []);

  return {
    isOnline,
    syncStatus,
    queue,
    queueCount: queue.length,
    enqueue,
    dequeue,
    syncNow,
    clearQueue,
  };
}
