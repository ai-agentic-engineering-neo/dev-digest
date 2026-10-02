import React from "react";
import { createPortal } from "react-dom";

/**
 * Popover — hover-triggered, read-only content panel. Unlike `Dropdown`
 * (click-triggered, closes on outside-click), a `Popover` opens/closes purely
 * on hover: the trigger and the panel share one close-timeout so moving the
 * cursor from one to the other doesn't dismiss it. The panel renders through
 * a portal into `document.body` and is positioned from the trigger's
 * bounding rect (`position: fixed`) so it isn't clipped by an ancestor with
 * `overflow: hidden` (e.g. the PR list's table card) — an absolutely
 * positioned panel nested in the DOM would be. Content is caller-supplied
 * and inherently read-only — this component has no notion of actions.
 */
export function Popover({
  trigger,
  title,
  children,
  align = "left",
  width = 340,
  onOpenChange,
}: {
  trigger: React.ReactNode;
  title?: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  width?: number;
  /** Fires when the panel opens/closes — lets callers gate a lazy fetch on hover. */
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left?: number; right?: number } | null>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const show = () => {
    cancelClose();
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        setPos(
          align === "right"
            ? { top: rect.bottom + 6, right: window.innerWidth - rect.right }
            : { top: rect.bottom + 6, left: rect.left },
        );
      }
      setOpen(true);
      onOpenChange?.(true);
    }
  };
  const scheduleHide = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      onOpenChange?.(false);
    }, 120);
  };

  React.useEffect(() => () => cancelClose(), []);

  // Closing on scroll/resize avoids a fixed-position panel drifting away from
  // its trigger — simpler than recomputing position continuously.
  React.useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      onOpenChange?.(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div
      ref={triggerRef}
      style={{ display: "inline-block" }}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      {trigger}
      {open &&
        pos &&
        createPortal(
          <div
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleHide}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              right: pos.right,
              width,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              boxShadow: "var(--shadow-modal)",
              padding: 10,
              zIndex: 70,
              animation: "ddpop .12s ease",
            }}
          >
            {title && (
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "var(--text-muted)",
                  marginBottom: 8,
                }}
              >
                {title}
              </div>
            )}
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
