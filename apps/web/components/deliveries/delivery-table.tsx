"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type {
  DeliveryResponse,
  DeliveryStatusType,
  PriorityType,
} from "@/lib/api/deliveries";

// ── Status badge config ──────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  DeliveryStatusType,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }
> = {
  pending: { label: "Pending", variant: "secondary" },
  assigned: { label: "Assigned", variant: "info" },
  picked_up: { label: "Picked Up", variant: "info" },
  in_transit: { label: "In Transit", variant: "warning" },
  climbing_stairs: { label: "Climbing", variant: "warning" },
  arrived: { label: "Arrived", variant: "info" },
  delivered: { label: "Delivered", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline" },
};

const PRIORITY_CONFIG: Record<
  PriorityType,
  { label: string; className: string }
> = {
  normal: { label: "Normal", className: "text-muted-foreground" },
  urgent: { label: "Urgent", className: "text-orange-600 dark:text-orange-400 font-semibold" },
  express: { label: "Express", className: "text-red-600 dark:text-red-400 font-semibold" },
};

// ── Helper ───────────────────────────────────────────────────────────────

function formatLocation(loc: DeliveryResponse["pickup_location"]): string {
  const parts = [loc.building, `Floor ${loc.floor}`];
  if (loc.room) parts.push(loc.room);
  return parts.join(" · ");
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Component ────────────────────────────────────────────────────────────

interface DeliveryTableProps {
  deliveries: DeliveryResponse[];
  className?: string;
}

export function DeliveryTable({ deliveries, className }: DeliveryTableProps) {
  if (deliveries.length === 0) {
    return (
      <div className={cn("rounded-lg border bg-card p-8 text-center", className)}>
        <p className="text-muted-foreground">No deliveries found.</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-card overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">
              ID
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">
              Status
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
              Priority
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">
              Recipient
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">
              From
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">
              To
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
              Weight
            </th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">
              Created
            </th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((delivery) => {
            const statusCfg = STATUS_CONFIG[delivery.status];
            const priorityCfg = PRIORITY_CONFIG[delivery.priority];

            return (
              <tr
                key={delivery.id}
                className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3 font-mono text-xs">
                  {delivery.id}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <span className={priorityCfg.className}>
                    {priorityCfg.label}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  {delivery.recipient_name ?? "—"}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                  {formatLocation(delivery.pickup_location)}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                  {formatLocation(delivery.dropoff_location)}
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  {delivery.package_weight > 0
                    ? `${delivery.package_weight} kg`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {timeAgo(delivery.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
