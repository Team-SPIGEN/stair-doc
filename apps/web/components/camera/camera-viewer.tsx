"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Video,
  VideoOff,
  MonitorPlay,
  Aperture,
  Wifi,
  WifiOff,
  RefreshCw,
  Maximize,
  Minimize,
  Activity,
} from "lucide-react";
import {
  fetchCameraStreams,
  type CameraStreamInfo,
} from "@/lib/api/camera";
import { ROBOT_ID } from "@/lib/robot";
import { getSocket } from "@/lib/socket/client";
import { cn } from "@/lib/utils";

// ── Quality presets ──────────────────────────────────────────────────────

type StreamQuality = "low" | "med" | "high";

const QUALITY_PRESETS: Record<StreamQuality, { label: string; resolution: string }> = {
  low: { label: "Low (320×240)", resolution: "320x240" },
  med: { label: "Med (640×480)", resolution: "640x480" },
  high: { label: "High (1280×720)", resolution: "1280x720" },
};

// ── Stream placeholder visual ────────────────────────────────────────────

function StreamPlaceholder({
  active,
  robotName,
  fps,
  quality,
  streamUrl,
}: {
  active: boolean;
  robotName: string;
  fps: number;
  quality: StreamQuality;
  streamUrl?: string | null;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed",
        "border-emerald-500/40 bg-gradient-to-br from-emerald-950/60 via-black to-emerald-950/40",
      )}
    >
      {/* Always show the live feed since the Pi is broadcasting continuously */}
      <>
        <img
          src={streamUrl || "http://192.168.8.114:8080/stream.mjpg"}
          alt="Live Feed"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,100,0.03)_2px,rgba(0,255,100,0.03)_4px)]" />
      </>

      {/* Overlay status indicators */}
      {active && (
        <>
          <div className="absolute left-3 top-3 flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-red-400">
              REC
            </span>
          </div>
          <div className="absolute right-3 top-3 text-[10px] tabular-nums text-emerald-500/60">
            {new Date().toLocaleTimeString()}
          </div>
          {/* FPS indicator bottom-right */}
          <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5">
            <Activity className="h-3 w-3 text-emerald-400" />
            <span className="text-[10px] font-mono tabular-nums text-emerald-400">
              {fps} fps
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main CameraViewer ────────────────────────────────────────────────────

export function CameraViewer() {
  const [streams, setStreams] = useState<CameraStreamInfo[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>(ROBOT_ID);
  const [isLoading, setIsLoading] = useState(true);
  const [socketConnected, setSocketConnected] = useState(false);
  const [lastSnapshot, setLastSnapshot] = useState<string | null>(null);
  const [quality, setQuality] = useState<StreamQuality>("high");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load streams ───────────────────────────────────────────────────

  const loadStreams = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchCameraStreams();
      setStreams(data);
      setSelectedRobotId(ROBOT_ID);
    } catch {
      // Graceful degrade
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStreams();
  }, [loadStreams]);

  // ── Socket.IO for camera events + auto-reconnect ───────────────────

  useEffect(() => {
    const socket = getSocket();
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      setSocketConnected(true);
      setReconnecting(false);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const onDisconnect = () => {
      setSocketConnected(false);
      // Auto-reconnect after 3 seconds
      if (!reconnectTimerRef.current) {
        setReconnecting(true);
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          if (!socket.connected) {
            socket.connect();
          }
        }, 3000);
      }
    };

    const onCameraFrame = (data: {
      robot_id: string;
      frame_type: string;
      timestamp: string;
      message: string;
    }) => {
      if (data.robot_id === selectedRobotId && data.frame_type === "snapshot") {
        setLastSnapshot(data.timestamp);
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("camera_frame", onCameraFrame);

    if (socket.connected) setSocketConnected(true);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("camera_frame", onCameraFrame);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [selectedRobotId]);

  // ── Fullscreen ─────────────────────────────────────────────────────

  const toggleFullscreen = useCallback(async () => {
    if (!viewerRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await viewerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      // Fullscreen not supported or denied
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // ── Snapshot action ────────────────────────────────────────────────

  const handleSnapshot = useCallback(async () => {
    if (!selectedRobotId) return;
    
    // Trigger actual hardware capture on the Pi
    try {
      await fetch("http://192.168.8.114:8080/capture", { mode: 'no-cors' });
    } catch (e) {
      console.error("Hardware capture trigger failed:", e);
    }

    const socket = getSocket();
    if (socket.connected) {
      socket.emit("camera_snapshot", {
        robotId: selectedRobotId,
        cameraSource: "front",
      });
    }
  }, [selectedRobotId]);

  // ── Stream toggle ──────────────────────────────────────────────────

  const handleStreamToggle = useCallback(() => {
    if (!selectedRobotId) return;
    const current = streams.find((s) => s.robot_id === selectedRobotId);
    const socket = getSocket();
    if (socket.connected) {
      socket.emit("camera_stream_toggle", {
        robotId: selectedRobotId,
        action: current?.stream_active ? "stop" : "start",
      });
    }
  }, [selectedRobotId, streams]);

  // ── Derived ────────────────────────────────────────────────────────

  const selectedStream = streams.find((s) => s.robot_id === selectedRobotId);
  const activeStreams = streams.filter((s) => s.stream_active).length;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="aspect-video w-full rounded-lg" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card ref={viewerRef} className={cn(isFullscreen && "rounded-none border-0")}>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MonitorPlay className="h-5 w-5" />
              Live Robot Camera
            </CardTitle>
            <CardDescription>
              {activeStreams} of {streams.length} camera
              {streams.length !== 1 ? "s" : ""} active
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={socketConnected ? "success" : reconnecting ? "warning" : "destructive"}>
              {socketConnected ? (
                <Wifi className="mr-1 h-3 w-3" />
              ) : (
                <WifiOff className="mr-1 h-3 w-3" />
              )}
              {socketConnected ? "Connected" : reconnecting ? "Reconnecting…" : "Disconnected"}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Robot selector + quality */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          {streams.length > 1 && (
            <Select
              value={selectedRobotId}
              onChange={(e) => setSelectedRobotId(e.target.value)}
              className="w-full sm:w-[240px]"
            >
              {streams.map((s) => (
                <option key={s.robot_id} value={s.robot_id}>
                  {s.stream_active ? "\u25CF " : "\u25CB "}{s.robot_name}
                </option>
              ))}
            </Select>
          )}

          <Select
            value={quality}
            onChange={(e) => setQuality(e.target.value as StreamQuality)}
            className="w-full sm:w-[180px]"
          >
            <option value="low">{QUALITY_PRESETS.low.label}</option>
            <option value="med">{QUALITY_PRESETS.med.label}</option>
            <option value="high">{QUALITY_PRESETS.high.label}</option>
          </Select>

          {selectedStream && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{selectedStream.resolution}</span>
              <span>{selectedStream.fps} fps</span>
              <span className="capitalize">
                {selectedStream.camera_source} cam
              </span>
            </div>
          )}
        </div>

        {/* Video feed area */}
        {selectedStream ? (
          <StreamPlaceholder
            active={true} // Force active to true since Pi streams continuously
            robotName={selectedStream.robot_name}
            fps={selectedStream.fps}
            quality={quality}
            streamUrl={selectedStream.stream_url}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/20">
            <p className="text-sm text-muted-foreground">
              No cameras available
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSnapshot}
            disabled={!selectedStream?.stream_active}
            className="min-h-[44px] touch-manipulation sm:min-h-0"
          >
            <Aperture className="mr-2 h-4 w-4" />
            Snapshot
          </Button>
          <Button
            variant={selectedStream?.stream_active ? "destructive" : "default"}
            size="sm"
            onClick={handleStreamToggle}
            disabled={!selectedStream}
            className="min-h-[44px] touch-manipulation sm:min-h-0"
          >
            {selectedStream?.stream_active ? (
              <>
                <VideoOff className="mr-2 h-4 w-4" />
                Stop Stream
              </>
            ) : (
              <>
                <Video className="mr-2 h-4 w-4" />
                Start Stream
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            className="min-h-[44px] touch-manipulation sm:min-h-0"
          >
            {isFullscreen ? (
              <Minimize className="mr-2 h-4 w-4" />
            ) : (
              <Maximize className="mr-2 h-4 w-4" />
            )}
            {isFullscreen ? "Exit" : "Fullscreen"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadStreams}
            className="min-h-[44px] touch-manipulation sm:min-h-0"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Footer: last snapshot + FPS indicator */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div>
            {lastSnapshot && (
              <span>
                Last snapshot: {new Date(lastSnapshot).toLocaleString()}
              </span>
            )}
          </div>
          {selectedStream?.stream_active && (
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3" />
              <span className="font-mono tabular-nums">
                {selectedStream.fps} fps
              </span>
              <span className="text-muted-foreground/60">·</span>
              <span>{QUALITY_PRESETS[quality].resolution}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
