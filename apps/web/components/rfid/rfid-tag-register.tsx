"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import {
  registerRFIDTag,
  RFIDApiError,
  type RFIDTagResponse,
} from "@/lib/api/rfid";

interface RfidTagRegisterProps {
  onRegistered: (tag: RFIDTagResponse) => void;
}

export function RfidTagRegister({ onRegistered }: RfidTagRegisterProps) {
  const [tagId, setTagId] = useState("");
  const [userName, setUserName] = useState("");
  const [role, setRole] = useState("recipient");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const tag = await registerRFIDTag({
        tag_id: tagId.trim(),
        user_name: userName.trim(),
        role,
      });
      onRegistered(tag);
      setTagId("");
      setUserName("");
      setRole("recipient");
    } catch (err) {
      setError(
        err instanceof RFIDApiError ? err.message : "Failed to register tag",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4" />
          Register RFID Tag
        </CardTitle>
        <CardDescription>
          Admin only — assign a physical tag to a user and role.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tag-id">Tag ID</Label>
            <Input
              id="tag-id"
              value={tagId}
              onChange={(e) => setTagId(e.target.value)}
              placeholder="RFID-A1B2C3"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-name">User name</Label>
            <Input
              id="user-name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Alice Johnson"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tag-role">Role</Label>
            <Select
              id="tag-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="recipient">Recipient</option>
              <option value="operator">Operator</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Registering…" : "Register tag"}
            </Button>
          </div>
        </form>
        {error && (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
