"use client";

import { cn } from "@/lib/utils";
import { Battery, BatteryCharging, BatteryLow, BatteryWarning } from "lucide-react";

interface BatteryGaugeProps {
  level: number;
  isCharging?: boolean;
  showPercentage?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function BatteryGauge({
  level,
  isCharging = false,
  showPercentage = true,
  size = "md",
  className,
}: BatteryGaugeProps) {
  const clampedLevel = Math.max(0, Math.min(100, level));

  const getBatteryColor = () => {
    if (isCharging) return "text-blue-500";
    if (clampedLevel <= 15) return "text-red-500";
    if (clampedLevel <= 30) return "text-orange-500";
    if (clampedLevel <= 50) return "text-yellow-500";
    return "text-emerald-500";
  };

  const getFillColor = () => {
    if (isCharging) return "bg-blue-500";
    if (clampedLevel <= 15) return "bg-red-500";
    if (clampedLevel <= 30) return "bg-orange-500";
    if (clampedLevel <= 50) return "bg-yellow-500";
    return "bg-emerald-500";
  };

  const sizeClasses = {
    sm: { container: "h-4 w-8", icon: "h-4 w-4", text: "text-xs" },
    md: { container: "h-6 w-12", icon: "h-5 w-5", text: "text-sm" },
    lg: { container: "h-8 w-16", icon: "h-6 w-6", text: "text-base" },
  };

  const { container, icon, text } = sizeClasses[size];
  const iconClassName = cn(icon, getBatteryColor());

  const renderIcon = () => {
    if (isCharging) return <BatteryCharging className={iconClassName} />;
    if (clampedLevel <= 15) return <BatteryLow className={iconClassName} />;
    if (clampedLevel <= 30) return <BatteryWarning className={iconClassName} />;
    return <Battery className={iconClassName} />;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative">
        {renderIcon()}
      </div>

      <div className="flex flex-col gap-1">
        <div
          className={cn(
            "relative overflow-hidden rounded-full bg-muted",
            container
          )}
        >
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
              getFillColor()
            )}
            style={{ width: `${clampedLevel}%` }}
          />
        </div>
        {showPercentage && (
          <span className={cn("font-medium", text, getBatteryColor())}>
            {clampedLevel}%{isCharging && " ⚡"}
          </span>
        )}
      </div>
    </div>
  );
}

interface BatteryGaugeCircularProps {
  level: number;
  isCharging?: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function BatteryGaugeCircular({
  level,
  isCharging = false,
  size = 120,
  strokeWidth = 12,
  className,
}: BatteryGaugeCircularProps) {
  const clampedLevel = Math.max(0, Math.min(100, level));
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (clampedLevel / 100) * circumference;

  const getStrokeColor = () => {
    if (isCharging) return "stroke-blue-500";
    if (clampedLevel <= 15) return "stroke-red-500";
    if (clampedLevel <= 30) return "stroke-orange-500";
    if (clampedLevel <= 50) return "stroke-yellow-500";
    return "stroke-emerald-500";
  };

  const getTextColor = () => {
    if (isCharging) return "text-blue-500";
    if (clampedLevel <= 15) return "text-red-500";
    if (clampedLevel <= 30) return "text-orange-500";
    if (clampedLevel <= 50) return "text-yellow-500";
    return "text-emerald-500";
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn("transition-all duration-500 ease-out", getStrokeColor())}
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className={cn("text-2xl font-bold", getTextColor())}>
          {clampedLevel}%
        </span>
        {isCharging && (
          <span className="text-xs text-blue-500 font-medium">Charging</span>
        )}
      </div>
    </div>
  );
}
