/* j/k navigation and a/d accept-dismiss for one FindingsPanel. Several panels can be
   mounted (one per review run); only the one last interacted with reacts to a key. */
"use client";

import React from "react";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { KEY_TO_ACTION } from "./constants";
import { shouldIgnoreShortcut } from "./helpers";

/** Id of the panel that last had focus or a pointer press; shared by every mounted panel. */
let activePanelId: string | null = null;

export function useFindingShortcuts({
  shown,
  focusIdx,
  setFocusIdx,
  pending,
  act,
}: {
  shown: FindingRecord[];
  focusIdx: number;
  setFocusIdx: React.Dispatch<React.SetStateAction<number>>;
  pending: boolean;
  act: (findingId: string, action: FindingActionKind) => void;
}) {
  const id = React.useId();

  // The first panel to mount is the active one until the user touches another.
  React.useEffect(() => {
    activePanelId ??= id;
    return () => {
      if (activePanelId === id) activePanelId = null;
    };
  }, [id]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (activePanelId !== id || shouldIgnoreShortcut(e)) return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx] && !pending) {
        act(shown[focusIdx]!.id, KEY_TO_ACTION[e.key]!);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [id, shown, focusIdx, setFocusIdx, pending, act]);

  const activate = React.useCallback(() => {
    activePanelId = id;
  }, [id]);
  return { onPointerDownCapture: activate, onFocusCapture: activate };
}
