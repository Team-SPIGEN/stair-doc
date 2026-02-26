"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { OctagonX, AlertTriangle, Loader2 } from "lucide-react";

interface EmergencyStopButtonProps {
  onEmergencyStop: () => Promise<void>;
  robotName?: string;
  className?: string;
}

export function EmergencyStopButton({
  onEmergencyStop,
  robotName,
  className,
}: EmergencyStopButtonProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (!isConfirming) {
      setIsConfirming(true);
      setTimeout(() => setIsConfirming(false), 3000);
      return;
    }

    setIsLoading(true);
    try {
      await onEmergencyStop();
    } finally {
      setIsLoading(false);
      setIsConfirming(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={cn(
          "group relative flex h-24 w-24 items-center justify-center rounded-full transition-all duration-300",
          "shadow-lg hover:shadow-xl active:scale-95",
          isConfirming
            ? "bg-red-600 shadow-red-500/50 animate-pulse"
            : "bg-gradient-to-br from-red-500 to-red-700 hover:from-red-600 hover:to-red-800",
          isLoading && "cursor-not-allowed opacity-75"
        )}
      >
        {/* Outer ring animation */}
        <div
          className={cn(
            "absolute inset-0 rounded-full border-4 transition-all duration-300",
            isConfirming
              ? "border-red-400 animate-ping"
              : "border-red-400/30 group-hover:border-red-400/50"
          )}
        />

        {/* Inner glow */}
        <div className="absolute inset-2 rounded-full bg-gradient-to-br from-red-400/20 to-transparent" />

        {/* Icon */}
        {isLoading ? (
          <Loader2 className="h-10 w-10 text-white animate-spin" />
        ) : isConfirming ? (
          <AlertTriangle className="h-10 w-10 text-white" />
        ) : (
          <OctagonX className="h-10 w-10 text-white transition-transform group-hover:scale-110" />
        )}
      </button>

      <div className="text-center">
        <p className="font-bold text-red-600 dark:text-red-400">
          {isLoading
            ? "STOPPING..."
            : isConfirming
            ? "CLICK AGAIN TO CONFIRM"
            : "EMERGENCY STOP"}
        </p>
        {robotName ? (
          <p className="text-xs text-muted-foreground">{robotName}</p>
        ) : (
          <p className="text-xs text-muted-foreground">All Robots</p>
        )}
      </div>
    </div>
  );
}

interface EmergencyStopBannerProps {
  onEmergencyStop: () => Promise<void>;
  isActive?: boolean;
  className?: string;
}

export function EmergencyStopBanner({
  onEmergencyStop,
  isActive = false,
  className,
}: EmergencyStopBannerProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      await onEmergencyStop();
    } finally {
      setIsLoading(false);
    }
  };

  if (isActive) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-4 rounded-lg bg-red-600 p-4 text-white",
          className
        )}
      >
        <div className="flex items-center gap-3">
          <OctagonX className="h-6 w-6 animate-pulse" />
          <div>
            <p className="font-bold">EMERGENCY STOP ACTIVE</p>
            <p className="text-sm text-red-100">All robots have been halted</p>
          </div>
        </div>
        <button
          onClick={handleClick}
          disabled={isLoading}
          className="rounded-lg bg-white px-4 py-2 font-semibold text-red-600 transition hover:bg-red-50"
        >
          {isLoading ? "Resuming..." : "Resume Operations"}
        </button>
      </div>
    );
  }

  return null;
}
