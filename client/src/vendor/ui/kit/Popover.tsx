import React from "react";
import { createPortal } from "react-dom";

/**
 * Popover — a click-triggered content panel.
 *
 * Unlike `Dropdown` (a menu, absolutely positioned inside its wrapper), this
 * renders through a PORTAL with `position: fixed`. That is load-bearing, not
 * stylistic: the PR-list table card sets `overflow: hidden` to clip its rounded
 * corners, so an absolutely-positioned panel inside a row gets cut off. The
 * portal also makes the viewport-bottom flip possible.
 *
 * Because React portals propagate events through the COMPONENT tree rather than
 * the DOM tree, a click inside the panel still reaches an ancestor's onClick —
 * e.g. the PR row's navigate handler. Both the trigger and the panel therefore
 * stop propagation here, so no consumer has to remember to.
 *
 * `trigger` must be INERT content (spans, badges, icons): this component
 * supplies the real `<button>` around it, so passing a `Button` or an anchor
 * nests interactive elements and React will warn. That is the opposite of
 * `Dropdown`, whose trigger wrapper is a plain div.
 */
export function Popover({
  trigger,
  children,
  label,
  align = "start",
  width = 520,
  onOpenChange,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Accessible name for the trigger and the panel. */
  label: string;
  align?: "start" | "end";
  width?: number;
  /** Fires on open and on close — e.g. to defer a fetch until first opened. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = React.useState(false);
  // Every caller below is a real transition (the listeners only run while open),
  // so this never fires a redundant change.
  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next);
      onOpenChange?.(next);
    },
    [onOpenChange]
  );
  const [pos, setPos] = React.useState<{ top: number; left: number; maxHeight: number } | null>(
    null
  );
  const wrapRef = React.useRef<HTMLSpanElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const place = React.useCallback(() => {
    const trig = wrapRef.current;
    if (!trig) return;
    const r = trig.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 6;
    const EDGE = 8;
    const PREFERRED = vh * 0.6;

    const rawLeft = align === "end" ? r.right - width : r.left;
    const left = Math.max(EDGE, Math.min(rawLeft, vw - width - EDGE));

    // Content height once rendered; 0 on the first pass, which opens downward.
    const h = panelRef.current?.scrollHeight ?? 0;
    const roomBelow = vh - r.bottom - GAP - EDGE;
    const roomAbove = r.top - GAP - EDGE;
    // Flip up only when the content doesn't fit below AND there is more room
    // above — otherwise stay below and let the panel scroll internally.
    const flip = h > Math.min(roomBelow, PREFERRED) && roomAbove > roomBelow;
    const room = flip ? roomAbove : roomBelow;
    const maxHeight = Math.max(120, Math.min(PREFERRED, room));
    const top = flip ? r.top - GAP - Math.min(h, maxHeight) : r.bottom + GAP;

    setPos({ top, left, maxHeight });
  }, [align, width]);

  // Position on open, then again once the panel's real height is known.
  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place]);

  React.useLayoutEffect(() => {
    if (open && pos && panelRef.current) place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, children]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      wrapRef.current?.querySelector("button")?.focus();
    };
    const onReflow = () => place();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, place]);

  return (
    <span ref={wrapRef} style={{ display: "inline-flex" }}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
        }}
      >
        {trigger}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={label}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width,
              maxHeight: pos?.maxHeight ?? "60vh",
              overflowY: "auto",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              padding: 12,
              zIndex: 60,
              animation: "ddpop .12s ease",
              visibility: pos ? "visible" : "hidden",
              cursor: "default",
            }}
          >
            {children}
          </div>,
          document.body
        )}
    </span>
  );
}
