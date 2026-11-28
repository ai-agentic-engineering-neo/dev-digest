import React from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/**
 * Dialog accessibility shared by Modal and Drawer: moves focus into the dialog
 * on open (an element marked `data-autofocus`, else the first focusable, else
 * the dialog itself), keeps Tab inside it, closes on Escape, and restores
 * focus to the previously focused element on unmount. Returns the ref and the
 * keydown handler to put on the `role="dialog"` element, plus the title id for
 * `aria-labelledby`.
 */
export function useDialogA11y(onClose?: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    if (node) {
      const target = node.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(node)[0] ?? node;
      target.focus();
    }
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return; // a nested dialog already handled this key
    if (e.key === "Escape" && onClose) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !ref.current) return;
    const items = focusables(ref.current);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return { ref, titleId, onKeyDown };
}
