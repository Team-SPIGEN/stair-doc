"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchSupportedCommands,
  sendVoiceCommand,
  VoiceAction,
  VoiceCommandPayload,
  VoiceCommandResponse,
} from "@/lib/api/voice";
import type { SupportedCommand } from "@/lib/api/voice";
import { getSocket } from "@/lib/socket/client";

// Web Speech API typings (fallback to any to avoid DOM lib issues in SSR)
type SpeechRecognition = any;
type SpeechRecognitionEvent = any;
type SpeechRecognitionErrorEvent = any;
type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
  }
}
function getSpeechImpl(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function pickNaturalVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("en"));
  const candidates = englishVoices.length ? englishVoices : voices;
  const preferredNames = [
    "samantha",
    "ava",
    "allison",
    "susan",
    "karen",
    "victoria",
    "google us english",
    "google uk english female",
    "microsoft aria",
    "microsoft jenny",
    "microsoft zira",
    "alex",
  ];

  return (
    candidates.find((voice) => {
      const name = voice.name.toLowerCase();
      return preferredNames.some((preferred) => name.includes(preferred));
    }) ??
    candidates.find((voice) => voice.localService) ??
    candidates[0] ??
    null
  );
}

export interface VoiceHistoryItem {
  id: string;
  text: string;
  action: VoiceAction;
  executed: boolean;
  message: string;
  timestamp: string;
  confidence?: number;
}

export type { SupportedCommand };

export interface UseVoiceCommandsOptions {
  robotId?: string;
  role?: "admin" | "operator" | "recipient";
  onCommand?: (response: VoiceCommandResponse) => void;
  continuous?: boolean;
}

export interface UseVoiceCommandsReturn {
  isSupported: boolean;
  isListening: boolean;
  isProcessing: boolean;
  transcript: string;
  partialTranscript: string;
  lastCommand: string | null;
  history: VoiceHistoryItem[];
  error: string | null;
  pendingConfirmation: VoiceCommandResponse | null;
  supportedCommands: SupportedCommand[];
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  submitText: (text: string, opts?: { confirm?: boolean }) => Promise<void>;
  confirmPending: () => Promise<void>;
  cancelPending: () => void;
  clearHistory: () => void;
  clearError: () => void;
}

interface VoiceActivityPayload {
  text: string;
  robot_id: string;
  role: string;
  action: VoiceAction;
  target_floor?: number | null;
  confidence?: number;
  executed: boolean;
  message: string;
  timestamp: string;
}

interface VoiceExecutedPayload {
  action: VoiceAction;
  robot_id: string;
  executed: boolean;
  message: string;
  timestamp: string;
}

export function useVoiceCommands(
  options: UseVoiceCommandsOptions = {},
): UseVoiceCommandsReturn {
  const { robotId = "robot-001", role = "operator", onCommand, continuous = false } = options;

  const SpeechRecognitionImpl = getSpeechImpl();

  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [history, setHistory] = useState<VoiceHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] =
    useState<VoiceCommandResponse | null>(null);
  const [supportedCommands, setSupportedCommands] = useState<SupportedCommand[]>([]);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const submittingRef = useRef(false);

  // Fetch supported commands on mount -------------------------------------

  useEffect(() => {
    fetchSupportedCommands()
      .then(setSupportedCommands)
      .catch(() => {
        /* non-fatal — supported commands are cosmetic */
      });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    const loadVoices = () => {
      setSpeechVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, []);

  // Helpers -----------------------------------------------------------------

  const speak = useCallback((message: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    const voice = pickNaturalVoice(speechVoices);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-US";
    }
    utterance.rate = 0.88;
    utterance.pitch = 0.92;
    utterance.volume = 0.85;
    window.speechSynthesis.speak(utterance);
  }, [speechVoices]);

  const addHistory = useCallback((item: VoiceHistoryItem) => {
    setHistory((prev) => [item, ...prev].slice(0, 12));
  }, []);

  const clearHistory = useCallback(() => setHistory([]), []);
  const clearError = useCallback(() => setError(null), []);

  const handleApiResponse = useCallback(
    (response: VoiceCommandResponse) => {
      addHistory({
        id: `${response.timestamp}-${Math.random()}`,
        text: response.text,
        action: response.intent.action,
        executed: response.executed,
        message: response.message,
        timestamp: response.timestamp,
        confidence: response.intent.confidence,
      });

      setLastCommand(response.text);

      if (response.intent.requires_confirmation && !response.executed) {
        setPendingConfirmation(response);
      } else {
        setPendingConfirmation(null);
      }

      if (response.executed && typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([15, 50, 15]);
      }

      speak(response.message);

      onCommand?.(response);
    },
    [addHistory, onCommand, speak],
  );

  const submitText = useCallback(
    async (text: string, opts?: { confirm?: boolean }) => {
      const trimmed = text.trim();
      if (!trimmed || submittingRef.current) return;

      if (/never mind|cancel/i.test(trimmed)) {
        setPendingConfirmation(null);
        return;
      }

      submittingRef.current = true;
      setIsProcessing(true);
      setTranscript(trimmed);
      setError(null);
      try {
        const payload: VoiceCommandPayload = {
          text: trimmed,
          user_role: role,
          robot_id: robotId,
          confirm: opts?.confirm ?? false,
        };
        const response = await sendVoiceCommand(payload);
        handleApiResponse(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to process";
        setError(message);
      } finally {
        submittingRef.current = false;
        setIsProcessing(false);
      }
    },
    [handleApiResponse, role, robotId],
  );

  // Speech recognition lifecycle -------------------------------------------

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setPartialTranscript("");
  }, []);

  const startListening = useCallback(() => {
    if (!SpeechRecognitionImpl) return;
    if (recognitionRef.current) recognitionRef.current.stop();

    const recognition = new SpeechRecognitionImpl();
    recognitionRef.current = recognition;
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          finalText += `${text} `;
        } else {
          interim += `${text} `;
        }
      }
      if (interim) setPartialTranscript(interim.trim());
      if (finalText.trim()) {
        setPartialTranscript("");
        submitText(finalText.trim());
        if (!continuous) recognition.stop();
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") {
        setError(
          event.error === "not-allowed"
            ? "Microphone permission denied. Please allow access in browser settings."
            : `Speech error: ${event.error}`,
        );
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      // Restart automatically in continuous mode if we're still "on"
      if (continuous && recognitionRef.current === recognition) {
        setIsListening((prev) => {
          if (prev) {
            try { recognition.start(); } catch { /* ignore */ }
            return true;
          }
          return false;
        });
      } else {
        setIsListening(false);
      }
    };

    setTranscript("");
    setPartialTranscript("");
    setIsListening(true);
    recognition.start();
  }, [SpeechRecognitionImpl, continuous, submitText]);

  const toggleListening = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  // Socket subscriptions for live activity ---------------------------------

  useEffect(() => {
    const socket = getSocket();

    const handleActivity = (data: VoiceActivityPayload) => {
      addHistory({
        id: data.timestamp,
        text: data.text,
        action: data.action,
        executed: data.executed,
        message: data.message,
        timestamp: data.timestamp,
        confidence: data.confidence,
      });
    };

    const handleExecuted = (data: VoiceExecutedPayload) => {
      addHistory({
        id: data.timestamp,
        text: data.action,
        action: data.action,
        executed: data.executed,
        message: data.message,
        timestamp: data.timestamp,
      });
    };

    socket.on("voice_activity", handleActivity);
    socket.on("voice_command_executed", handleExecuted);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off("voice_activity", handleActivity);
      socket.off("voice_command_executed", handleExecuted);
    };
  }, [addHistory]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      recognitionRef.current?.stop();
    },
    [],
  );

  // Confirmation helpers ----------------------------------------------------

  const confirmPending = useCallback(async () => {
    if (!pendingConfirmation) return;
    const text = pendingConfirmation.text;
    setPendingConfirmation(null);
    await submitText(text, { confirm: true });
  }, [pendingConfirmation, submitText]);

  const cancelPending = useCallback(() => {
    setPendingConfirmation(null);
  }, []);

  return {
    isSupported: Boolean(SpeechRecognitionImpl),
    isListening,
    isProcessing,
    transcript,
    partialTranscript,
    lastCommand,
    history,
    error,
    pendingConfirmation,
    supportedCommands,
    startListening,
    stopListening,
    toggleListening,
    submitText,
    confirmPending,
    cancelPending,
    clearHistory,
    clearError,
  };
}
