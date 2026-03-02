"use client";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

/**
 * Thin client wrapper that activates global keyboard shortcuts.
 * Mounted once inside `RootLayout` (server component).
 */
export function KeyboardShortcutsProvider() {
  useKeyboardShortcuts();
  return null;
}
