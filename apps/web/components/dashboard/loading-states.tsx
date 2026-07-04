"use client";

import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { RobotCardSkeleton } from "./robot-card";
import { Loader2, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardLoadingProps {
  className?: string;
}

export function DashboardLoading({ className }: DashboardLoadingProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Robot cards */}
        <div className="lg:col-span-2 grid gap-4 md:grid-cols-1 max-w-md">
          <RobotCardSkeleton />
        </div>

        {/* Activity feed skeleton */}
        <div className="space-y-4">
          <Skeleton className="h-8 w-32" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

interface DashboardErrorProps {
  error: string;
  onRetry?: () => void;
  className?: string;
}

export function DashboardError({
  error,
  onRetry,
  className,
}: DashboardErrorProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4",
        className
      )}
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 mb-6">
        <WifiOff className="h-10 w-10 text-red-500" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Connection Error</h2>
      <p className="text-muted-foreground text-center max-w-md mb-6">
        {error}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      )}
    </div>
  );
}

interface ConnectionStatusProps {
  isConnected: boolean;
  className?: string;
}

export function ConnectionStatus({
  isConnected,
  className,
}: ConnectionStatusProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
        isConnected
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-red-500/10 text-red-600 dark:text-red-400",
        className
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
        )}
      />
      {isConnected ? "Live" : "Disconnected"}
    </div>
  );
}

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingSpinner({
  size = "md",
  className,
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6",
    lg: "h-8 w-8",
  };

  return (
    <Loader2
      className={cn("animate-spin text-muted-foreground", sizeClasses[size], className)}
    />
  );
}
