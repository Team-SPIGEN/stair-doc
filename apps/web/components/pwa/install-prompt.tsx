"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { Button } from "@/components/ui/button";
import { X, Download, Share } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Floating install-prompt banner anchored at the bottom of the viewport.
 * Shows when:
 *  - Android/Chrome: `beforeinstallprompt` fired (isPromptable)
 *  - iOS Safari: user hasn't dismissed + hasn't installed (isIOS && !isInstalled)
 *
 * Dismissed state is persisted in sessionStorage for the current browser session.
 */
export function InstallPromptBanner() {
  const { isInstalled, isPromptable, isIOS, installState, promptInstall, dismissPrompt } =
    useInstallPrompt();

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Small delay so the page loads before we show the banner
    const t = setTimeout(() => {
      const shouldShow = !isInstalled && (isPromptable || isIOS);
      setVisible(shouldShow);
    }, 3000);
    return () => clearTimeout(t);
  }, [isInstalled, isPromptable, isIOS]);

  const handleDismiss = () => {
    setVisible(false);
    dismissPrompt();
  };

  const handleInstall = async () => {
    if (isIOS) return; // iOS: link to /install page for instructions
    const accepted = await promptInstall();
    if (accepted) setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Install StairDoc app"
      className={cn(
        "fixed bottom-[env(safe-area-inset-bottom,0px)] left-0 right-0 z-50 px-4 pb-4",
        // Avoid overlapping the mobile nav bar (64px)
        "mb-16 md:mb-0 md:bottom-4 md:left-auto md:right-4 md:max-w-sm",
      )}
    >
      <div className="rounded-2xl border bg-card shadow-2xl overflow-hidden">
        <div className="flex items-start gap-3 p-4">
          {/* App icon */}
          <div className="flex-shrink-0 relative h-12 w-12 rounded-xl overflow-hidden border">
            <Image
              src="/icons/icon-192x192.png"
              alt="StairDoc"
              fill
              className="object-cover"
            />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm leading-tight">Install StairDoc</p>
            <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">
              {isIOS
                ? 'Tap Share then \u201cAdd to Home Screen\u201d to install.'
                : "Add to home screen for a faster, offline-capable experience."}
            </p>
          </div>

          {/* Close */}
          <button
            onClick={handleDismiss}
            aria-label="Dismiss install prompt"
            className="flex-shrink-0 p-1 rounded-full hover:bg-muted transition-colors touch-manipulation"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4">
          {isIOS ? (
            <Link href="/install" className="flex-1" onClick={() => setVisible(false)}>
              <Button
                variant="default"
                className="w-full min-h-[44px] gap-2 text-sm"
              >
                <Share className="h-4 w-4" />
                See Instructions
              </Button>
            </Link>
          ) : (
            <Button
              variant="default"
              className="flex-1 min-h-[44px] gap-2 text-sm"
              onClick={() => void handleInstall()}
              disabled={installState === "installing"}
            >
              <Download className="h-4 w-4" />
              {installState === "installing" ? "Installing…" : "Install"}
            </Button>
          )}
          <Button
            variant="ghost"
            className="min-h-[44px] text-sm text-muted-foreground"
            onClick={handleDismiss}
          >
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
