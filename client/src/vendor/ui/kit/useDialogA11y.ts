import { useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, topmost last. Only the topmost one reacts to Escape/Tab, so a
 *  modal opened over a drawer closes alone instead of taking both down. */
const openDialogs: symbol[] = [];

/**
 * Shared dialog behaviour for Modal and Drawer:
 *  - Escape closes (topmost dialog only)
 *  - Tab / Shift+Tab stay inside the dialog (focus trap)
 *  - focus moves into the dialog on open and is restored to the trigger on close
 *  - `titleId` links the dialog to its title via `aria-labelledby`
 */
export function useDialogA11y(onClose?: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Latest callback without re-running the effect (callers pass inline arrows).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const me = Symbol("dialog");
    openDialogs.push(me);
    const trigger = document.activeElement as HTMLElement | null;

    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));

    // Don't steal focus from an `autoFocus` child that already took it.
    if (!node.contains(document.activeElement)) node.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (openDialogs[openDialogs.length - 1] !== me || !node) return;
      if (e.key === "Escape") {
        if (onCloseRef.current) {
          e.stopPropagation();
          onCloseRef.current();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      const outside = !node.contains(active) || active === node;
      if (e.shiftKey && (outside || active === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (outside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const i = openDialogs.indexOf(me);
      if (i !== -1) openDialogs.splice(i, 1);
      trigger?.focus?.();
    };
  }, []);

  return { ref, titleId };
}
