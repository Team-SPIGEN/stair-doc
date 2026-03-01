"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OpenAPI } from "@/lib/api/client";

// ── Types ─────────────────────────────────────────────────────────────────

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

export type PushNotificationType =
  | "delivery_ready"
  | "low_battery"
  | "rfid_denied"
  | "emergency_stop"
  | "delivery_complete"
  | "delivery_failed"
  | "robot_offline";

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  role: string;
  robot_id?: string;
}

export interface UsePushNotificationsReturn {
  permission: NotificationPermissionState;
  isSubscribed: boolean;
  isLoading: boolean;
  vapidPublicKey: string | null;
  subscribe: (role?: string) => Promise<boolean>;
  unsubscribe: () => Promise<void>;
  sendTestNotification: (type: PushNotificationType) => Promise<void>;
}

// ── Utilities ─────────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getVapidKey(): Promise<string | null> {
  // Fast-path: env var available at build time
  const envKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (envKey) return envKey;
  // Fallback: fetch from backend
  try {
    const res = await fetch(`${OpenAPI.BASE}/api/v1/notifications/vapid-public-key`);
    if (!res.ok) return null;
    const { data } = await res.json();
    return data?.public_key ?? null;
  } catch {
    return null;
  }
}

async function postSubscription(
  payload: PushSubscriptionPayload,
): Promise<boolean> {
  try {
    const res = await fetch(`${OpenAPI.BASE}/api/v1/notifications/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteSubscription(endpoint: string): Promise<void> {
  try {
    await fetch(`${OpenAPI.BASE}/api/v1/notifications/unsubscribe`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch { /* non-fatal */ }
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);

  // Detect initial permission state and fetch VAPID key
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission as NotificationPermissionState);

    // Check if already subscribed
    navigator.serviceWorker.ready
      .then(async (reg) => {
        swRegRef.current = reg;
        const existing = await reg.pushManager.getSubscription();
        setIsSubscribed(Boolean(existing));
      })
      .catch(() => {});

    // Fetch VAPID public key from backend
    getVapidKey().then(setVapidPublicKey);
  }, []);

  const subscribe = useCallback(
    async (role = "operator"): Promise<boolean> => {
      if (permission === "unsupported") return false;
      setIsLoading(true);
      try {
        // Request permission
        const perm = await Notification.requestPermission();
        setPermission(perm as NotificationPermissionState);
        if (perm !== "granted") return false;

        // Get or fetch VAPID key
        const key = vapidPublicKey ?? (await getVapidKey());
        if (!key) return false;
        setVapidPublicKey(key);

        // Get SW registration
        const reg = swRegRef.current ?? (await navigator.serviceWorker.ready);
        swRegRef.current = reg;

        // Subscribe to push
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key),
        });

        const json = sub.toJSON() as {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        };

        const ok = await postSubscription({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          },
          role,
        });

        setIsSubscribed(ok);
        return ok;
      } catch (err) {
        console.error("[push] Subscribe failed", err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [permission, vapidPublicKey],
  );

  const unsubscribe = useCallback(async () => {
    const reg = swRegRef.current ?? (await navigator.serviceWorker.ready);
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await deleteSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setIsSubscribed(false);
  }, []);

  const sendTestNotification = useCallback(
    async (type: PushNotificationType) => {
      try {
        await fetch(`${OpenAPI.BASE}/api/v1/notifications/test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type }),
        });
      } catch { /* non-fatal */ }
    },
    [],
  );

  return {
    permission,
    isSubscribed,
    isLoading,
    vapidPublicKey,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}
