"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { register } from "@/lib/api/auth";
import { getStoredToken } from "@/lib/api/auth";
import { AuthApiError } from "@/lib/api/auth";
import type { UserRole } from "@/types/auth";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Login form ───────────────────────────────────────────────────────────

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await login({ email, password });
      router.push("/");
    } catch (err) {
      if (err instanceof AuthApiError) {
        setError(err.message);
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Welcome Back</CardTitle>
        <CardDescription>
          Sign in to the Stair-Doc delivery control panel
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="operator@stairdoc.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Signing in…" : "Sign In"}
          </Button>


        </form>
      </CardContent>
    </Card>
  );
}

// ── Register form (admin only) ───────────────────────────────────────────

function RegisterForm() {
  const { role } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedRole, setSelectedRole] = useState<UserRole>("recipient");
  const [floorAccess, setFloorAccess] = useState("1");
  const [rfidTags, setRfidTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (role !== "admin") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Register User</CardTitle>
          <CardDescription>
            Only administrators can register new users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 text-center">
            You must be logged in as an admin to use this form.
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const token = getStoredToken();
      if (!token) throw new Error("Not authenticated");

      const floors = floorAccess
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      const tags = rfidTags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await register(
        {
          email,
          password,
          name,
          role: selectedRole,
          floor_access: floors,
          rfid_tags: tags,
        },
        token,
      );

      setSuccess(`User "${name}" registered successfully!`);
      setName("");
      setEmail("");
      setPassword("");
      setFloorAccess("1");
      setRfidTags("");
    } catch (err) {
      if (err instanceof AuthApiError) {
        setError(err.message);
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Register New User</CardTitle>
        <CardDescription>Create a new user account (admin only)</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-md bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
              {success}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reg-name">Name</Label>
            <Input
              id="reg-name"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              type="email"
              placeholder="user@stairdoc.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-password">Password</Label>
            <Input
              id="reg-password"
              type="password"
              placeholder="Min 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-role">Role</Label>
            <select
              id="reg-role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as UserRole)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="operator">Operator</option>
              <option value="recipient">Recipient</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-floors">Floor Access (comma-separated)</Label>
            <Input
              id="reg-floors"
              placeholder="1, 2, 3"
              value={floorAccess}
              onChange={(e) => setFloorAccess(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-rfid">RFID Tags (comma-separated)</Label>
            <Input
              id="reg-rfid"
              placeholder="RFID-001, RFID-002"
              value={rfidTags}
              onChange={(e) => setRfidTags(e.target.value)}
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Registering…" : "Register User"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function AuthPage() {
  const { isAuthenticated, role } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight">Stair-Doc</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Robot Delivery Control System
        </p>
      </div>

      {/* Tab switcher (only show register tab when authenticated as admin) */}
      <div className="flex gap-2">
        <Button
          variant={tab === "login" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("login")}
        >
          Sign In
        </Button>
        {isAuthenticated && role === "admin" && (
          <Button
            variant={tab === "register" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("register")}
          >
            Register User
          </Button>
        )}
      </div>

      {tab === "login" ? <LoginForm /> : <RegisterForm />}
    </div>
  );
}
