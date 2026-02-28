"use client";

import { Select } from "@/components/ui/select";
import type { DeliveryStatusType, PriorityType } from "@/lib/api/deliveries";

interface DeliveryFiltersProps {
  statusFilter: DeliveryStatusType | "";
  priorityFilter: PriorityType | "";
  sortOrder: "asc" | "desc";
  onStatusChange: (value: DeliveryStatusType | "") => void;
  onPriorityChange: (value: PriorityType | "") => void;
  onSortChange: (value: "asc" | "desc") => void;
}

export function DeliveryFilters({
  statusFilter,
  priorityFilter,
  sortOrder,
  onStatusChange,
  onPriorityChange,
  onSortChange,
}: DeliveryFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="w-full sm:w-44">
        <Select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) =>
            onStatusChange(e.target.value as DeliveryStatusType | "")
          }
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="assigned">Assigned</option>
          <option value="picked_up">Picked Up</option>
          <option value="in_transit">In Transit</option>
          <option value="climbing_stairs">Climbing Stairs</option>
          <option value="arrived">Arrived</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      </div>
      <div className="w-full sm:w-40">
        <Select
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(e) =>
            onPriorityChange(e.target.value as PriorityType | "")
          }
        >
          <option value="">All Priorities</option>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
          <option value="express">Express</option>
        </Select>
      </div>
      <div className="w-full sm:w-40">
        <Select
          aria-label="Sort order"
          value={sortOrder}
          onChange={(e) => onSortChange(e.target.value as "asc" | "desc")}
        >
          <option value="desc">Newest First</option>
          <option value="asc">Oldest First</option>
        </Select>
      </div>
    </div>
  );
}
