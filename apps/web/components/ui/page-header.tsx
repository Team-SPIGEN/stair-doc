import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  badge?: string;
  /** Extra content slotted to the right */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Reusable gradient hero header for dashboard pages.
 * Uses a blue → purple gradient background with a subtle grid overlay.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-purple-600 p-6 text-white shadow-xl",
        className,
      )}
    >
      {/* subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.15) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.15) 1px,transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
              <Icon className="h-5 w-5 text-white" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
                {title}
              </h1>
              {badge && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium backdrop-blur-sm">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-1 text-sm text-blue-100">{description}</p>
            )}
          </div>
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}
