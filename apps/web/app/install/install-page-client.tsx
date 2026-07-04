"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useInstallPrompt } from "@/hooks/use-install-prompt";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Download,
  Share,
  Plus,
  CheckCircle,
  Wifi,
  Bell,
  Smartphone,
  ArrowLeft,
} from "lucide-react";

export function InstallPageClient() {
  const { isInstalled, isPromptable, isIOS, promptInstall, installState } =
    useInstallPrompt();

  // Auto-prompt on Android/Chrome after a short delay
  useEffect(() => {
    if (isPromptable) {
      const t = setTimeout(() => {
        void promptInstall();
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [isPromptable, promptInstall]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3 flex items-center gap-3">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <span className="font-semibold text-sm">Install App</span>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 py-10 gap-8 max-w-md mx-auto w-full">
        {/* App icon + name */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative h-24 w-24 rounded-2xl overflow-hidden shadow-lg border">
            <Image
              src="/icons/icon-192x192.png"
              alt="StairDoc icon"
              fill
              sizes="96px"
              className="object-cover"
              priority
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold">StairDoc</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Robot Delivery Control
            </p>
          </div>
        </div>

        {/* Feature list */}
        <div className="grid gap-3 w-full">
          {[
            {
              icon: Wifi,
              title: "Works Offline",
              desc: "Queue deliveries and view status without internet",
            },
            {
              icon: Bell,
              title: "Push Notifications",
              desc: "Get instant alerts for deliveries and robot events",
            },
            {
              icon: Smartphone,
              title: "Native App Feel",
              desc: "Fullscreen, no browser chrome, instant launch",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="border bg-card">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex-shrink-0 rounded-lg bg-primary/10 p-2">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">{title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Install CTA */}
        {isInstalled || installState === "installed" ? (
          <div className="flex flex-col items-center gap-2 text-center">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <p className="font-semibold">App Installed!</p>
            <p className="text-muted-foreground text-sm">
              Open StairDoc from your home screen.
            </p>
            <Link href="/">
              <Button className="mt-2 min-h-[48px] px-8">Open App</Button>
            </Link>
          </div>
        ) : isIOS ? (
          <IOSInstructions />
        ) : (
          <Button
            onClick={() => void promptInstall()}
            disabled={!isPromptable || installState === "installing"}
            className="w-full min-h-[52px] text-base font-semibold gap-2"
          >
            <Download className="h-5 w-5" />
            {installState === "installing" ? "Installing…" : "Add to Home Screen"}
          </Button>
        )}
      </main>
    </div>
  );
}

function IOSInstructions() {
  return (
    <div className="w-full rounded-xl border bg-amber-50 dark:bg-amber-950/20 p-5 space-y-4">
      <p className="font-semibold text-sm">To install on iPhone / iPad:</p>
      <ol className="space-y-3 text-sm text-muted-foreground">
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            1
          </span>
          <span>
            Tap the{" "}
            <Share className="inline h-4 w-4 align-text-bottom" />
            {" "}
            <strong>Share</strong> button in Safari&apos;s toolbar
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            2
          </span>
          <span>
            Scroll down and tap{" "}
            <strong>
              <Plus className="inline h-4 w-4 align-text-bottom" /> Add to Home Screen
            </strong>
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
            3
          </span>
          <span>
            Tap <strong>Add</strong> in the top-right corner
          </span>
        </li>
      </ol>
    </div>
  );
}
