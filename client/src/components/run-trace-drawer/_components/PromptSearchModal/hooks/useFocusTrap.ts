/* useFocusTrap — keyboard handler for a wrapper around a dialog: Escape closes it, Tab / Shift+Tab
   wrap between the first and last enabled focusable inside the container. The kit Modal has no
   key handling of its own, so the wrapper catches events from everything inside it. */
import React from "react";

const FOCUSABLE = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  onEscape: () => void,
): (e: React.KeyboardEvent) => void {
  return React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      const container = containerRef.current;
      if (!container) return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [containerRef, onEscape],
  );
}
