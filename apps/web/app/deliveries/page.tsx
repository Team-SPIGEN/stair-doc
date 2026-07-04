"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGate } from "@/components/auth/role-gate";
import { Package } from "lucide-react";
import {
  DeliveryTable,
  DeliveryForm,
  DeliveryFilters,
} from "@/components/deliveries";
import {
  fetchDeliveries,
  createDelivery,
  type DeliveryResponse,
  type DeliveryCreatePayload,
  type DeliveryStatusType,
  type PriorityType,
  DeliveryApiError,
} from "@/lib/api/deliveries";

export default function DeliveriesPage() {
  // ── State ──────────────────────────────────────────────────────────────
  const [deliveries, setDeliveries] = useState<DeliveryResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<DeliveryStatusType | "">("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityType | "">("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // ── Fetch deliveries ───────────────────────────────────────────────────

  const loadDeliveries = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchDeliveries({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        sort: sortOrder,
      });
      setDeliveries(res.deliveries);
    } catch (err) {
      const message =
        err instanceof DeliveryApiError
          ? err.message
          : "Failed to load deliveries";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, priorityFilter, sortOrder]);

  useEffect(() => {
    void loadDeliveries();
  }, [loadDeliveries]);

  // ── Create delivery ────────────────────────────────────────────────────

  const handleCreate = async (payload: DeliveryCreatePayload) => {
    setIsSubmitting(true);
    try {
      await createDelivery(payload);
      setShowForm(false);
      await loadDeliveries();
    } catch (err) {
      const message =
        err instanceof DeliveryApiError
          ? err.message
          : "Failed to create delivery";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Package}
        title="Delivery Queue"
        description="Manage and track all robot deliveries in real-time"
        actions={
          <RoleGate allowed={["operator", "admin"]}>
            <Button
              onClick={() => setShowForm((prev) => !prev)}
              className="min-h-[44px] touch-manipulation bg-white/20 hover:bg-white/30 text-white border-white/30 backdrop-blur-sm"
              variant="outline"
            >
              {showForm ? "Cancel" : "+ New Delivery"}
            </Button>
          </RoleGate>
        }
      />

      {/* Create form (collapsible) — operators and admins only */}
      <RoleGate allowed={["operator", "admin"]}>
        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Create Delivery</CardTitle>
              <CardDescription>
                Add a new delivery to the queue. It will start with
                &quot;Pending&quot; status.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeliveryForm
                onSubmit={handleCreate}
                isSubmitting={isSubmitting}
              />
            </CardContent>
          </Card>
        )}
      </RoleGate>

      {/* Filters */}
      <DeliveryFilters
        statusFilter={statusFilter}
        priorityFilter={priorityFilter}
        sortOrder={sortOrder}
        onStatusChange={setStatusFilter}
        onPriorityChange={setPriorityFilter}
        onSortChange={setSortOrder}
      />

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          Loading deliveries…
        </div>
      ) : (
        <DeliveryTable deliveries={deliveries} />
      )}

      {/* Summary footer */}
      {!isLoading && (
        <p className="text-xs text-muted-foreground text-right">
          Showing {deliveries.length} deliver{deliveries.length === 1 ? "y" : "ies"}
        </p>
      )}
    </div>
  );
}
