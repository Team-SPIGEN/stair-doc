"use client";

import { useCallback, useEffect, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallState =
  | "idle"           // No prompt available yet
  | "promptable"     // beforeinstallprompt fired — can trigger
  | "installing"     // User accepted, installing
  | "installed"      // App installed (standalone mode)
  | "dismissed";     // User dismissed

export interface UseInstallPromptReturn {
  installState: InstallState;
  isInstalled: boolean;
  isPromptable: boolean;
  isIOS: boolean;
  promptInstall: () => Promise<boolean>;
  dismissPrompt: () => void;
}

const STORAGE_KEY = "pwa-install-dismissed";

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: unknown }).MSStream
  );
}

function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useInstallPrompt(): UseInstallPromptReturn {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState<InstallState>(() =>
    detectInstalled() ? "installed" : "idle",
  );
  const [isIOS] = useState<boolean>(detectIOS);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setInstallState("promptable");
    };

    const installedHandler = () => {
      setInstallState("installed");
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    setInstallState("installing");
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallState("installed");
      setDeferredPrompt(null);
      return true;
    }
    setInstallState("dismissed");
    setDeferredPrompt(null);
    return false;
  }, [deferredPrompt]);

  const dismissPrompt = useCallback(() => {
    setInstallState("dismissed");
    setDeferredPrompt(null);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch { /* ignore */ }
  }, []);

  return {
    installState,
    isInstalled: installState === "installed",
    isPromptable: installState === "promptable",
    isIOS,
    promptInstall,
    dismissPrompt,
  };
}
