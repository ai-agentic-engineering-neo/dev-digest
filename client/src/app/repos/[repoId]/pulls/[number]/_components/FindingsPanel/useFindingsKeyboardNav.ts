"use client";

import React from "react";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { KEY_TO_ACTION } from "./constants";

/**
 * j/k navigation + a/d accept/dismiss shortcuts on the focused finding.
 * Ignored while typing in an input/textarea.
 */
export function useFindingsKeyboardNav({
  shown,
  focusIdx,
  setFocusIdx,
  onAction,
}: {
  shown: FindingRecord[];
  focusIdx: number;
  setFocusIdx: React.Dispatch<React.SetStateAction<number>>;
  onAction: (findingId: string, action: FindingActionKind) => void;
}): void {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        onAction(shown[focusIdx]!.id, KEY_TO_ACTION[e.key]!);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, setFocusIdx, onAction]);
}
