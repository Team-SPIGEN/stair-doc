"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useVoiceCommands } from "@/hooks/use-voice-commands";
import type { VoiceHistoryItem } from "@/hooks/use-voice-commands";
import type { VoiceCommandResponse } from "@/lib/api/voice";
import {
  Mic,
  ShieldAlert,
  Lock,
  Camera,
  Send,
  Check,
  X,
  Volume2,
  Loader2,
  Home,
  Trash2,
  Navigation,
} from "lucide-react";

interface VoiceControlProps {
  robotId?: string;
  role?: "admin" | "operator" | "recipient";
  title?: string;
  onCommand?: (response: VoiceCommandResponse) => void;
}

// ── History list ─────────────────────────────────────────────────────────────

function HistoryList({
  items,
  onClear,
}: {
  items: VoiceHistoryItem[];
  onClear: () => void;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Voice activity will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Recent</p>
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>
      <ul className="space-y-2">
        {items.slice(0, 5).map((item) => (
          <li
            key={item.id}
            className={
              cn(
                "rounded-lg border px-3 py-2 text-sm",
                item.executed ? "bg-muted/40" : "bg-amber-500/10 border-amber-500/30"
              )
            }
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{item.text}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {new Date(item.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="uppercase font-mono">{item.action}</span>
              <span>·</span>
              <span className="truncate">{item.message}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── E-STOP confirmation with auto-countdown ──────────────────────────────────

function EmergencyConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState(3);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          onConfirm();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-destructive/40 bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-6 w-6 mt-0.5 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-semibold text-sm">Confirm Emergency Stop</p>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            variant="destructive"
            className="flex-1"
            onClick={() => {
              if (timerRef.current) clearInterval(timerRef.current);
              onConfirm();
            }}
          >
            <Check className="mr-2 h-4 w-4" />
            Confirm ({count}s)
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              if (timerRef.current) clearInterval(timerRef.current);
              onCancel();
            }}
          >
            <X className="mr-2 h-4 w-4" /> Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Navigation ETA confirmation modal ────────────────────────────────────────

function NavigationModal({
  floor,
  etaSeconds,
  message,
  onConfirm,
  onCancel,
}: {
  floor: number | null | undefined;
  etaSeconds: number | null | undefined;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const eta = etaSeconds != null ? `${etaSeconds}s` : null;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border bg-card p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <Navigation className="h-6 w-6 mt-0.5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-semibold text-sm">
              Navigate to Floor {floor ?? "?"}
            </p>
            {eta && (
              <p className="text-sm font-medium text-primary">ETA: {eta}</p>
            )}
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button className="flex-1" onClick={onConfirm}>
            <Check className="mr-2 h-4 w-4" /> Send Robot
          </Button>
          <Button variant="outline" className="flex-1" onClick={onCancel}>
            <X className="mr-2 h-4 w-4" /> Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function VoiceControl({
  robotId,
  role = "operator",
  title,
  onCommand,
}: VoiceControlProps) {
  const [manualText, setManualText] = useState("");

  const {
    isSupported,
    isListening,
    isProcessing,
    transcript,
    partialTranscript,
    history,
    error,
    pendingConfirmation,
    supportedCommands,
    toggleListening,
    submitText,
    confirmPending,
    cancelPending,
    clearHistory,
    clearError,
  } = useVoiceCommands({ robotId, role, onCommand });

  const quickCommands = useMemo(
    () => [
      { label: "Floor 1", text: "Go to floor 1" },
      { label: "Floor 2", text: "Go to floor 2" },
      { label: "Floor 3", text: "Go to floor 3" },
      { label: "Floor 4", text: "Go to floor 4" },
      { label: "Return home", text: "Return home", icon: Home },
      { label: "Unlock container", text: "Unlock container", icon: Lock },
      { label: "Take photo", text: "Take a photo", icon: Camera },
      { label: "Emergency stop", text: "Emergency stop now", destructive: true, icon: ShieldAlert },
    ],
    [],
  );

  const handleManualSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!manualText.trim()) return;
      await submitText(manualText.trim());
      setManualText("");
    },
    [manualText, submitText],
  );

  // Determine which modal to show
  const isEmergencyPending =
    pendingConfirmation?.intent.action === "emergency_stop";
  const isNavPending =
    pendingConfirmation?.intent.action === "navigate" &&
    pendingConfirmation.intent.requires_confirmation;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-semibold">
          {title ?? "Voice Control"}
        </CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Volume2 className="h-4 w-4" />
          <span>{role}</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Mic button + transcript row */}
        <div className="flex items-center gap-4">
          {/* Pulsing circular mic button */}
          <button
            onClick={toggleListening}
            disabled={!isSupported || isProcessing}
            aria-label={isListening ? "Stop listening" : "Start listening"}
            className={
              cn(
                "relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full transition-all duration-200",
                "bg-primary text-primary-foreground shadow-md touch-manipulation select-none",
                "disabled:opacity-50 disabled:pointer-events-none",
                isListening && "animate-pulse ring-4 ring-destructive ring-offset-2 ring-offset-background bg-destructive",
                !isListening && !isProcessing && "hover:scale-105 active:scale-95",
              )
            }
          >
            {isProcessing ? (
              <Loader2 className="h-7 w-7 animate-spin" />
            ) : (
              <Mic className="h-7 w-7" />
            )}
            {isListening && (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive shadow"/>
            )}
          </button>

          {/* Transcript area */}
          <div className="flex-1 rounded-lg border bg-muted/40 p-3 min-h-[64px]">
            <p className="text-xs text-muted-foreground mb-1">
              {isListening ? "Listening…" : isProcessing ? "Processing…" : "Transcript"}
            </p>
            <p className="text-sm leading-snug">
              {partialTranscript ? (
                <span className="text-muted-foreground italic">{partialTranscript}</span>
              ) : transcript ? (
                transcript
              ) : (
                <span className="text-muted-foreground">
                  Tap mic or type a command
                </span>
              )}
            </p>
          </div>
        </div>

        {!isSupported && (
          <p className="text-xs text-destructive">
            Voice recognition is not supported in this browser.
          </p>
        )}

        {/* Manual text input */}
        <form className="flex gap-2" onSubmit={handleManualSubmit}>
          <Input
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder="Type a voice command…"
            className="flex-1"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!manualText.trim() || isProcessing}
          >
            <Send className="mr-2 h-4 w-4" /> Send
          </Button>
        </form>

        {/* Quick command chips */}
        <div className="flex flex-wrap gap-1.5">
          {quickCommands.map((cmd) => {
            const Icon = cmd.icon;
            return (
              <Button
                key={cmd.text}
                size="sm"
                variant={cmd.destructive ? "destructive" : "outline"}
                onClick={() => submitText(cmd.text)}
                disabled={isProcessing}
                className="h-8 text-xs px-2.5"
              >
                {Icon && <Icon className="mr-1.5 h-3.5 w-3.5" />}
                {cmd.label}
              </Button>
            );
          })}
        </div>

        {/* Supported commands chips (loaded from API) */}
        {supportedCommands.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Supported phrases</p>
            <div className="flex flex-wrap gap-1">
              {supportedCommands.map((sc) => (
                <button
                  key={sc.action}
                  title={sc.description}
                  onClick={() => submitText(sc.example)}
                  className="rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  {sc.phrase}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice history */}
        <HistoryList items={history} onClear={clearHistory} />

        {/* Error */}
        {error && (
          <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{error}</span>
            <button onClick={clearError} className="ml-2 flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </CardContent>

      {/* E-STOP auto-countdown modal */}
      {isEmergencyPending && pendingConfirmation && (
        <EmergencyConfirmModal
          message={pendingConfirmation.message}
          onConfirm={confirmPending}
          onCancel={cancelPending}
        />
      )}

      {/* Navigation ETA modal */}
      {isNavPending && pendingConfirmation && (
        <NavigationModal
          floor={pendingConfirmation.intent.target_floor}
          etaSeconds={(pendingConfirmation as { eta_seconds?: number }).eta_seconds}
          message={pendingConfirmation.message}
          onConfirm={confirmPending}
          onCancel={cancelPending}
        />
      )}
    </Card>
  );
}

