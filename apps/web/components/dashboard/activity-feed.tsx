"use client";

import { cn } from "@/lib/utils";
import { 
  Package, 
  Bot, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  XCircle,
  Zap 
} from "lucide-react";
import type { ActivityEvent } from "@/types/dashboard";

interface ActivityFeedProps {
  activities: ActivityEvent[];
  maxItems?: number;
  className?: string;
}

export function ActivityFeed({
  activities,
  maxItems = 10,
  className,
}: ActivityFeedProps) {
  const displayActivities = activities.slice(0, maxItems);

  const getIcon = (event: ActivityEvent) => {
    switch (event.type) {
      case "delivery":
        return Package;
      case "status":
        return Bot;
      case "alert":
        return AlertTriangle;
      case "system":
        return Zap;
      default:
        return Info;
    }
  };

  const getSeverityStyles = (severity: ActivityEvent["severity"]) => {
    switch (severity) {
      case "success":
        return {
          icon: "text-emerald-500",
          bg: "bg-emerald-500/10",
          border: "border-emerald-500/20",
        };
      case "warning":
        return {
          icon: "text-amber-500",
          bg: "bg-amber-500/10",
          border: "border-amber-500/20",
        };
      case "error":
        return {
          icon: "text-red-500",
          bg: "bg-red-500/10",
          border: "border-red-500/20",
        };
      default:
        return {
          icon: "text-blue-500",
          bg: "bg-blue-500/10",
          border: "border-blue-500/20",
        };
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-lg">Activity Feed</h3>
        <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        {displayActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Info className="h-8 w-8 mb-2" />
            <p className="text-sm">No recent activity</p>
          </div>
        ) : (
          displayActivities.map((event, index) => {
            const Icon = getIcon(event);
            const styles = getSeverityStyles(event.severity);

            return (
              <div
                key={event.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 transition-all duration-300",
                  styles.bg,
                  styles.border,
                  index === 0 && "animate-in slide-in-from-top-2"
                )}
              >
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    styles.bg
                  )}
                >
                  <Icon className={cn("h-4 w-4", styles.icon)} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {event.message}
                  </p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {event.robotName && (
                      <>
                        <span className="font-medium">{event.robotName}</span>
                        <span>•</span>
                      </>
                    )}
                    <span>{formatTime(event.timestamp)}</span>
                  </div>
                </div>

                {event.severity === "success" && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                )}
                {event.severity === "error" && (
                  <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
