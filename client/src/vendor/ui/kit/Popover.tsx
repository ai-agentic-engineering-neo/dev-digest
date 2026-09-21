/* Popover — hover-triggered anchored panel. Opens on mouseenter, closes on
   mouseleave with a short grace delay so moving the mouse from the trigger
   into the panel doesn't flicker-close it. Unlike Dropdown (click-triggered,
   outside-click-close), there's no click state to manage — just a timer. */
"use client";

import React from "react";

const CLOSE_DELAY_MS = 160;

export function Popover({
  trigger,
  content,
  align = "left",
  width = 320,
  strategy = "absolute",
}: {
  trigger: React.ReactNode;
  content: React.ReactNode;
  align?: "left" | "right";
  width?: number;
  /** "fixed" escapes an `overflow: hidden` ancestor (e.g. a table row card) by
   *  positioning from the trigger's viewport rect instead of relying on
   *  CSS-relative ancestor positioning. */
  strategy?: "absolute" | "fixed";
}) {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<{ top: number; left: number; right: number } | null>(
    null,
  );
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = React.useRef<HTMLDivElement>(null);

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const handleOpen = React.useCallback(() => {
    cancelClose();
    if (strategy === "fixed" && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setRect({ top: r.bottom + 6, left: r.left, right: window.innerWidth - r.right });
    }
    setOpen(true);
  }, [cancelClose, strategy]);

  React.useEffect(() => cancelClose, [cancelClose]);

  const panelStyle: React.CSSProperties =
    strategy === "fixed" && rect
      ? {
          position: "fixed",
          top: rect.top,
          [align === "right" ? "right" : "left"]: align === "right" ? rect.right : rect.left,
          width,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: 9,
          boxShadow: "var(--shadow-modal)",
          padding: 10,
          zIndex: 60,
          animation: "ddpop .12s ease",
        }
      : {
          position: "absolute",
          top: "calc(100% + 6px)",
          [align]: 0,
          width,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-strong)",
          borderRadius: 9,
          boxShadow: "var(--shadow-modal)",
          padding: 10,
          zIndex: 60,
          animation: "ddpop .12s ease",
        };

  return (
    <div
      ref={triggerRef}
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={handleOpen}
      onMouseLeave={scheduleClose}
    >
      {trigger}
      {open && (
        <div style={panelStyle} onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>
          {content}
        </div>
      )}
    </div>
  );
}
