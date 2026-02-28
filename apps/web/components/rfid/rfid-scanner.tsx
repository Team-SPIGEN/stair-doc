"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  Wifi,
  WifiOff,
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  authorizeRFID,
  type RFIDAuthorizeResponse,
  type ContainerStatus,
} from "@/lib/api/rfid";
import { getSocket } from "@/lib/socket/client";

// ── Types ────────────────────────────────────────────────────────────────

type ScanPhase =
  | "idle"
  | "scanning"
  | "authorized"
  | "denied"
  | "error";

interface RFIDScannerProps {
  className?: string;
  /** When a live Socket.IO connection is available, emit via WS instead of REST */
  useSocket?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────

export function RFIDScanner({ className, useSocket = false }: RFIDScannerProps) {
  const [tagId, setTagId] = useState("RFID-A1B2C3");
  const [robotId, setRobotId] = useState("robot-001");
  const [phase, setPhase] = useState<ScanPhase>("idle");
  const [result, setResult] = useState<RFIDAuthorizeResponse | null>(null);
  const [containerStatus, setContainerStatus] = useState<ContainerStatus>("locked");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for Socket.IO rfid_result events
  useEffect(() => {
    if (!useSocket) return;

    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const handleResult = (data: RFIDAuthorizeResponse) => {
      setResult(data);
      setContainerStatus(data.container_status);
      setPhase(data.authorized ? "authorized" : "denied");

      // Auto-reset after 5 seconds
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setPhase("idle");
        setContainerStatus("locked");
      }, 5000);
    };

    socket.on("rfid_result", handleResult);
    return () => {
      socket.off("rfid_result", handleResult);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [useSocket]);

  const handleScan = useCallback(async () => {
    if (!tagId.trim() || !robotId.trim()) return;

    setPhase("scanning");
    setResult(null);

    try {
      if (useSocket) {
        // Emit via Socket.IO — result comes back via rfid_result event
        const socket = getSocket();
        socket.emit("rfid_scan", {
          tagId: tagId.trim(),
          robotId: robotId.trim(),
        });
      } else {
        // REST API fallback
        const res = await authorizeRFID({
          tag_id: tagId.trim(),
          robot_id: robotId.trim(),
        });
        setResult(res);
        setContainerStatus(res.container_status);
        setPhase(res.authorized ? "authorized" : "denied");

        // Auto-reset after 5 seconds
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setPhase("idle");
          setContainerStatus("locked");
        }, 5000);
      }
    } catch {
      setPhase("error");
      setContainerStatus("error");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setPhase("idle");
        setContainerStatus("locked");
      }, 4000);
    }
  }, [tagId, robotId, useSocket]);

  // ── Visual helpers ─────────────────────────────────────────────────

  const getLockIcon = () => {
    switch (containerStatus) {
      case "unlocked":
        return <Unlock className="h-12 w-12" />;
      case "error":
        return <ShieldAlert className="h-12 w-12" />;
      default:
        return <Lock className="h-12 w-12" />;
    }
  };

  const getPhaseStyles = (): { ring: string; bg: string; text: string; glow: string } => {
    switch (phase) {
      case "scanning":
        return {
          ring: "ring-blue-500/60",
          bg: "bg-blue-500/10",
          text: "text-blue-500",
          glow: "shadow-blue-500/30",
        };
      case "authorized":
        return {
          ring: "ring-emerald-500/60",
          bg: "bg-emerald-500/10",
          text: "text-emerald-500",
          glow: "shadow-emerald-500/30",
        };
      case "denied":
        return {
          ring: "ring-red-500/60",
          bg: "bg-red-500/10",
          text: "text-red-500",
          glow: "shadow-red-500/30",
        };
      case "error":
        return {
          ring: "ring-amber-500/60",
          bg: "bg-amber-500/10",
          text: "text-amber-500",
          glow: "shadow-amber-500/30",
        };
      default:
        return {
          ring: "ring-muted-foreground/20",
          bg: "bg-muted/50",
          text: "text-muted-foreground",
          glow: "",
        };
    }
  };

  const styles = getPhaseStyles();

  const statusLabel = (() => {
    switch (phase) {
      case "scanning":
        return "Scanning…";
      case "authorized":
        return "Access Granted";
      case "denied":
        return "Access Denied";
      case "error":
        return "Scan Error";
      default:
        return "Ready to Scan";
    }
  })();

  // ── Quick-select RFID tags for demo ────────────────────────────────

  const presetTags = [
    { id: "RFID-A1B2C3", label: "Alice (Active)" },
    { id: "RFID-D4E5F6", label: "Bob (Active)" },
    { id: "RFID-G7H8I9", label: "Carol (Operator)" },
    { id: "RFID-REVOKED", label: "Dave (Revoked)" },
    { id: "RFID-UNKNOWN", label: "Unknown Tag" },
  ];

  return (
    <div className={cn("rounded-xl border bg-card p-6", className)}>
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-semibold text-lg">RFID Scanner</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {useSocket ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-emerald-500" />
              <span>Real-time</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              <span>REST API</span>
            </>
          )}
        </div>
      </div>

      {/* ── Animated Lock Indicator ─────────────────────────────────── */}
      <div className="mb-6 flex flex-col items-center">
        <div
          className={cn(
            "relative flex h-28 w-28 items-center justify-center rounded-full ring-4 transition-all duration-500",
            styles.ring,
            styles.bg,
            styles.glow,
            phase === "scanning" && "animate-pulse",
            phase === "authorized" && "shadow-lg",
            phase === "denied" && "animate-shake",
          )}
        >
          <div className={cn("transition-colors duration-300", styles.text)}>
            {phase === "scanning" ? (
              <Loader2 className="h-12 w-12 animate-spin" />
            ) : phase === "authorized" ? (
              <ShieldCheck className="h-12 w-12" />
            ) : (
              getLockIcon()
            )}
          </div>

          {/* Ripple effect on scan */}
          {phase === "scanning" && (
            <>
              <span className="absolute inset-0 animate-ping rounded-full bg-blue-400/20" />
              <span className="absolute inset-2 animate-ping rounded-full bg-blue-400/10 animation-delay-200" />
            </>
          )}

          {/* Success burst */}
          {phase === "authorized" && (
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
          )}
        </div>

        <p
          className={cn(
            "mt-4 text-sm font-medium transition-colors duration-300",
            styles.text,
          )}
        >
          {statusLabel}
        </p>

        {result && (
          <p className="mt-1 text-xs text-muted-foreground text-center max-w-[280px]">
            {result.message}
          </p>
        )}
        {result?.user_name && phase === "authorized" && (
          <p className="mt-1 text-sm font-medium text-emerald-600">
            👤 {result.user_name}
          </p>
        )}
      </div>

      {/* ── Tag Quick Select ────────────────────────────────────────── */}
      <div className="mb-4">
        <Label className="mb-2 block text-xs text-muted-foreground">
          Quick Select Tag
        </Label>
        <div className="flex flex-wrap gap-2">
          {presetTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => setTagId(tag.id)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors",
                tagId === tag.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50",
              )}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Manual Input ────────────────────────────────────────────── */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="rfid-tag" className="mb-1.5 block text-xs">
            Tag ID
          </Label>
          <Input
            id="rfid-tag"
            value={tagId}
            onChange={(e) => setTagId(e.target.value)}
            placeholder="e.g., RFID-A1B2C3"
            className="h-9 text-sm"
          />
        </div>
        <div>
          <Label htmlFor="rfid-robot" className="mb-1.5 block text-xs">
            Robot ID
          </Label>
          <Input
            id="rfid-robot"
            value={robotId}
            onChange={(e) => setRobotId(e.target.value)}
            placeholder="e.g., robot-001"
            className="h-9 text-sm"
          />
        </div>
      </div>

      {/* ── Scan Button ─────────────────────────────────────────────── */}
      <Button
        onClick={handleScan}
        disabled={phase === "scanning" || !tagId.trim() || !robotId.trim()}
        className="w-full min-h-[44px] touch-manipulation"
      >
        {phase === "scanning" ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Scanning…
          </>
        ) : (
          <>
            <Send className="mr-2 h-4 w-4" />
            Simulate RFID Scan
          </>
        )}
      </Button>
    </div>
  );
}
