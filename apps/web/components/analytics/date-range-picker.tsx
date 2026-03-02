"use client";

import { cn } from "@/lib/utils";
import type { DateRange } from "@/lib/api/analytics";

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const OPTIONS: { label: string; value: DateRange }[] = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

export function DateRangePicker({ value, onChange, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-lg border bg-muted/40 p-1",
        className,
      )}
      role="group"
      aria-label="Date range"
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-all min-h-[36px]",
            value === opt.value
              ? "bg-background shadow text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
