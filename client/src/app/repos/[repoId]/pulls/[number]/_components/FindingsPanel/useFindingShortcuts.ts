/* j/k navigation and a/d accept-dismiss for one FindingsPanel. Several panels can be
   mounted (one per review run); only the one last interacted with reacts to a key. */
"use client";

import React from "react";
import type { FindingActionKind, FindingRecord } from "@devdigest/shared";
import { isTextInput } from "../../../../../../../components/app-shell/helpers";
import { KEY_TO_ACTION } from "./constants";
import { shouldIgnoreShortcut } from "./helpers";

/** Mounted panels in claim order; the last one is active (last focused or pressed). */
const mountedPanels: string[] = [];

function claim(id: string) {
  const i = mountedPanels.indexOf(id);
  if (i !== -1) mountedPanels.splice(i, 1);
  mountedPanels.push(id);
}

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

  // A new panel joins at the back of the claim order, so the first mounted panel stays
  // active until another is touched; on unmount the claim passes to a surviving panel.
  const gSince = React.useRef<number | null>(null);
  React.useEffect(() => {
    mountedPanels.unshift(id);
    return () => {
      mountedPanels.splice(mountedPanels.indexOf(id), 1);
    };
  }, [id]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // `g` starts the global nav chord; its next key belongs to the router, not to us.
      if (e.key === "g" && !isTextInput(e.target)) {
        gSince.current = Date.now();
        return;
      }
      const since = gSince.current;
      gSince.current = null;
      if (mountedPanels[mountedPanels.length - 1] !== id || shouldIgnoreShortcut(e, since)) return;
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
    claim(id);
  }, [id]);
  return { onPointerDownCapture: activate, onFocusCapture: activate };
}
