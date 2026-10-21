"use client";

import React from "react";

/**
 * Ctrl+S / Cmd+S runs `onSave` and suppresses the browser's own save dialog,
 * but only while `enabled` (the page is in Edit mode); otherwise the key keeps
 * its default behaviour.
 */
export function useSaveShortcut(enabled: boolean, onSave: () => void): void {
  const latest = React.useRef(onSave);
  React.useEffect(() => {
    latest.current = onSave;
  });
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        latest.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
