/* useDiffDeepLink — one-off scroll and 2 s highlight for a `file` / `line` deep link.
   Runs once per (path, line); a miss (file or line not rendered) does nothing. */
"use client";

import React from "react";
import type { DeepLinkTarget } from "./helpers";
import { HIGHLIGHT_MS, MAX_FRAMES } from "./constants";

export function useDiffDeepLink(target: DeepLinkTarget | null): boolean {
  const [highlight, setHighlight] = React.useState(false);
  const path = target?.path ?? null;
  const line = target?.line ?? null;

  React.useEffect(() => {
    if (!path) return;
    let frame = 0;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const card = Array.from(document.querySelectorAll<HTMLElement>("[data-diff-path]")).find(
        (el) => el.dataset.diffPath === path,
      );
      const lineEl = card && line != null ? card.querySelector<HTMLElement>(`[data-line="${line}"]`) : null;
      const waitForLine = line != null && !lineEl;
      if (!card || (waitForLine && frame < MAX_FRAMES)) {
        if (frame++ < MAX_FRAMES) raf = requestAnimationFrame(tick);
        return;
      }
      (lineEl ?? card).scrollIntoView?.({ block: "center", behavior: "smooth" });
      if (lineEl) {
        setHighlight(true);
        timer = setTimeout(() => setHighlight(false), HIGHLIGHT_MS);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      if (timer) clearTimeout(timer);
    };
  }, [path, line]);

  return highlight;
}
