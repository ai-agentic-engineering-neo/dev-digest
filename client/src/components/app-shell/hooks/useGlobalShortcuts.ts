"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { NAV, SETTINGS_ITEM, resolveHref } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import { G_NAV_TIMEOUT_MS } from "../constants";
import { isTextInput, useKeydown } from "@/lib/hooks/useKeydown";

interface GlobalShortcutHandlers {
  onOpenPalette: () => void;
  onOpenHelp: () => void;
}

/**
 * Binds the global keyboard shortcuts: Cmd/Ctrl+K opens the command
 * palette, `?` opens shortcuts help, and `g`-then-key navigates to a section.
 */
export function useGlobalShortcuts({ onOpenPalette, onOpenHelp }: GlobalShortcutHandlers): void {
  const router = useRouter();
  const { repoId } = useActiveRepo();

  // `g`-then-key state lives in refs: the handler is re-read on every render.
  const gPending = React.useRef(false);
  const gTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => clearTimeout(gTimer.current), []);

  // Not `ignoreInputs`: Cmd/Ctrl+K must work inside a text field; only the bare
  // keys below are dropped while typing.
  useKeydown((e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      onOpenPalette();
      return;
    }
    if (isTextInput(e.target)) return;
    if (e.key === "?") {
      onOpenHelp();
      return;
    }
    if (e.key === "g") {
      gPending.current = true;
      clearTimeout(gTimer.current);
      gTimer.current = setTimeout(() => (gPending.current = false), G_NAV_TIMEOUT_MS);
      return;
    }
    if (gPending.current) {
      gPending.current = false;
      const target = NAV.flatMap((g) => g.items).find((it) => it.gKey === e.key);
      if (target) router.push(resolveHref(target.href, repoId));
      else if (e.key === SETTINGS_ITEM.gKey) router.push(SETTINGS_ITEM.href);
    }
  });
}
