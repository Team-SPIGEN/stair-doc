"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  ShieldX,
  CreditCard,
  Radio,
  Users,
  Activity,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RFIDScanner } from "@/components/rfid/rfid-scanner";
import { RFIDTable } from "@/components/rfid/rfid-table";
import {
  fetchRFIDTags,
  fetchRFIDLogs,
  type RFIDTagResponse,
  type RFIDLogEntry,
} from "@/lib/api/rfid";
import { getSocket } from "@/lib/socket/client";
import { cn } from "@/lib/utils";

// ── Quick stat card ──────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  variant = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  variant?: "default" | "success" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            variant === "success" && "bg-emerald-500/10 text-emerald-500",
            variant === "destructive" && "bg-red-500/10 text-red-500",
            variant === "default" && "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function RFIDPage() {
  const [tags, setTags] = useState<RFIDTagResponse[]>([]);
  const [logs, setLogs] = useState<RFIDLogEntry[]>([]);
  const [liveLogs, setLiveLogs] = useState<RFIDLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const seqRef = useRef(0);

  // ── Initial data fetch ─────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [tagsData, logsData] = await Promise.all([
          fetchRFIDTags(),
          fetchRFIDLogs({ limit: 50 }),
        ]);
        setTags(tagsData);
        setLogs(logsData.logs);
      } catch {
        // Gracefully degrade — scanner still works
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // ── Socket.IO for live RFID events ─────────────────────────────────

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const onConnect = () => setSocketConnected(true);
    const onDisconnect = () => setSocketConnected(false);

    const onRFIDEvent = (data: {
      tag_id: string;
      robot_id: string;
      delivery_id?: string;
      authorized: boolean;
      user_name: string | null;
      scan_type: string;
      message: string;
      timestamp: string;
    }) => {
      seqRef.current += 1;
      const entry: RFIDLogEntry = {
        id: `live-${Date.now()}-${seqRef.current}`,
        tag_id: data.tag_id,
        robot_id: data.robot_id,
        delivery_id: data.delivery_id ?? null,
        scan_type: data.scan_type as RFIDLogEntry["scan_type"],
        authorized: data.authorized,
        user_name: data.user_name,
        location: null,
        message: data.message,
        timestamp: data.timestamp,
      };
      setLiveLogs((prev) => [entry, ...prev]);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("rfid_event", onRFIDEvent);

    if (socket.connected) setSocketConnected(true);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("rfid_event", onRFIDEvent);
    };
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────

  const activeTags = tags.filter((t) => t.status === "active").length;
  const totalScans = logs.length + liveLogs.length;
  const deniedScans =
    logs.filter((l) => !l.authorized).length +
    liveLogs.filter((l) => !l.authorized).length;
  const grantedScans = totalScans - deniedScans;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CreditCard}
        title="RFID Control"
        description="Manage container access, scan RFID tags, and view access logs"
        badge={socketConnected ? "Live" : undefined}
      />

      {/* ── Stat Cards ──────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active Tags"
          value={activeTags}
          icon={CreditCard}
        />
        <StatCard
          label="Total Scans"
          value={totalScans}
          icon={Activity}
        />
        <StatCard
          label="Access Granted"
          value={grantedScans}
          icon={ShieldCheck}
          variant="success"
        />
        <StatCard
          label="Access Denied"
          value={deniedScans}
          icon={ShieldX}
          variant="destructive"
        />
      </div>

      {/* ── Main Content ────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Scanner Panel */}
        <RFIDScanner useSocket={socketConnected} />

        {/* Access Logs */}
        <RFIDTable initialLogs={logs} liveLogs={liveLogs} />
      </div>

      {/* ── Registered Tags ─────────────────────────────────────────── */}
      {tags.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Registered Tags
            </CardTitle>
            <CardDescription>
              {tags.length} tag{tags.length !== 1 ? "s" : ""} registered in the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {tags.map((tag) => (
                <div
                  key={tag.tag_id}
                  className={cn(
                    "rounded-lg border p-3 transition-colors",
                    tag.status === "active"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-red-500/30 bg-red-500/5",
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <code className="text-xs font-mono">{tag.tag_id}</code>
                    <Badge
                      variant={tag.status === "active" ? "success" : "destructive"}
                      className="text-[10px] px-1.5 py-0"
                    >
                      {tag.status}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium">{tag.user_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {tag.role}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
