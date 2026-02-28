"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type {
  DeliveryCreatePayload,
  PriorityType,
} from "@/lib/api/deliveries";

interface DeliveryFormProps {
  onSubmit: (payload: DeliveryCreatePayload) => Promise<void>;
  isSubmitting?: boolean;
}

export function DeliveryForm({ onSubmit, isSubmitting }: DeliveryFormProps) {
  const [pickupFloor, setPickupFloor] = useState("1");
  const [pickupBuilding, setPickupBuilding] = useState("Building A");
  const [pickupRoom, setPickupRoom] = useState("");
  const [dropoffFloor, setDropoffFloor] = useState("3");
  const [dropoffBuilding, setDropoffBuilding] = useState("Building A");
  const [dropoffRoom, setDropoffRoom] = useState("");
  const [packageWeight, setPackageWeight] = useState("0");
  const [priority, setPriority] = useState<PriorityType>("normal");
  const [recipientName, setRecipientName] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload: DeliveryCreatePayload = {
      pickup_location: {
        floor: Number(pickupFloor),
        building: pickupBuilding,
        room: pickupRoom || null,
      },
      dropoff_location: {
        floor: Number(dropoffFloor),
        building: dropoffBuilding,
        room: dropoffRoom || null,
      },
      package_weight: Number(packageWeight) || 0,
      priority,
      recipient_name: recipientName || null,
      notes: notes || null,
    };

    await onSubmit(payload);

    // Reset form on success
    setPickupFloor("1");
    setPickupBuilding("Building A");
    setPickupRoom("");
    setDropoffFloor("3");
    setDropoffBuilding("Building A");
    setDropoffRoom("");
    setPackageWeight("0");
    setPriority("normal");
    setRecipientName("");
    setNotes("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Pickup Location ── */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">
          Pickup Location
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="pickup-building">Building</Label>
            <Select
              id="pickup-building"
              value={pickupBuilding}
              onChange={(e) => setPickupBuilding(e.target.value)}
            >
              <option value="Building A">Building A</option>
              <option value="Building B">Building B</option>
              <option value="Building C">Building C</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pickup-floor">Floor</Label>
            <Input
              id="pickup-floor"
              type="number"
              min={0}
              max={20}
              value={pickupFloor}
              onChange={(e) => setPickupFloor(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pickup-room">Room</Label>
            <Input
              id="pickup-room"
              placeholder="e.g. 101"
              value={pickupRoom}
              onChange={(e) => setPickupRoom(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {/* ── Drop-off Location ── */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">
          Drop-off Location
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dropoff-building">Building</Label>
            <Select
              id="dropoff-building"
              value={dropoffBuilding}
              onChange={(e) => setDropoffBuilding(e.target.value)}
            >
              <option value="Building A">Building A</option>
              <option value="Building B">Building B</option>
              <option value="Building C">Building C</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dropoff-floor">Floor</Label>
            <Input
              id="dropoff-floor"
              type="number"
              min={0}
              max={20}
              value={dropoffFloor}
              onChange={(e) => setDropoffFloor(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dropoff-room">Room</Label>
            <Input
              id="dropoff-room"
              placeholder="e.g. 305"
              value={dropoffRoom}
              onChange={(e) => setDropoffRoom(e.target.value)}
            />
          </div>
        </div>
      </fieldset>

      {/* ── Delivery Details ── */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-foreground">
          Delivery Details
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="recipient-name">Recipient</Label>
            <Input
              id="recipient-name"
              placeholder="Name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="package-weight">Weight (kg)</Label>
            <Input
              id="package-weight"
              type="number"
              min={0}
              max={50}
              step={0.1}
              value={packageWeight}
              onChange={(e) => setPackageWeight(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="priority">Priority</Label>
            <Select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as PriorityType)}
            >
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
              <option value="express">Express</option>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Input
            id="notes"
            placeholder="Optional delivery notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </fieldset>

      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto min-h-[44px] touch-manipulation"
      >
        {isSubmitting ? "Creating…" : "Create Delivery"}
      </Button>
    </form>
  );
}
