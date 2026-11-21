"use client";

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../icons";

const WIDTH = 320;
const GAP = 10;
const MARGIN = 12;
const HIDE_DELAY = 140;

export interface InfoTipSection {
  label: string;
  text: React.ReactNode;
}

/**
 * Small ⓘ button that explains the thing next to it. Opens on hover, focus or
 * click (touch); stays open while the pointer is over the bubble; Esc closes.
 * The bubble is portalled to <body> with fixed positioning, so card
 * `overflow: hidden` or a transformed canvas never clips it, and it flips
 * above the icon when there is no room below. An arrow points at the icon.
 */
export function InfoTip({
  label,
  title,
  sections,
  size = 13,
}: {
  /** Accessible name of the button, e.g. "About Blast Radius". */
  label: string;
  title?: string;
  sections: InfoTipSection[];
  size?: number;
}) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: number; above: boolean } | null>(null);

  const show = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setOpen(true);
  }, []);
  const hideSoon = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setOpen(false), HIDE_DELAY);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const h = bubble.current?.offsetHeight ?? 160;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.min(WIDTH, vw - MARGIN * 2);
      const center = r.left + r.width / 2;
      const left = Math.min(Math.max(center - width / 2, MARGIN), vw - width - MARGIN);
      const above = r.bottom + GAP + h > vh - MARGIN && r.top - GAP - h > MARGIN;
      setPos({
        top: above ? r.top - GAP - h : r.bottom + GAP,
        left,
        arrowLeft: Math.min(Math.max(center - left, 14), width - 14),
        above,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        btn.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => () => void (hideTimer.current && clearTimeout(hideTimer.current)), []);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 2,
          margin: 0,
          border: "none",
          borderRadius: 99,
          background: "transparent",
          color: open ? "var(--accent-text)" : "var(--text-muted)",
          cursor: "help",
          lineHeight: 0,
          verticalAlign: "middle",
          flexShrink: 0,
        }}
      >
        <Icon.Info size={size} />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={hideSoon}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: Math.min(WIDTH, typeof window !== "undefined" ? window.innerWidth - MARGIN * 2 : WIDTH),
              zIndex: 1000,
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--bg-elevated)",
              boxShadow: "var(--shadow-modal)",
              color: "var(--text-secondary)",
              fontSize: 12.5,
              lineHeight: 1.5,
              textAlign: "left",
              textTransform: "none",
              letterSpacing: 0,
              fontWeight: 400,
              visibility: pos ? "visible" : "hidden",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: (pos?.arrowLeft ?? 20) - 6,
                [pos?.above ? "bottom" : "top"]: -6,
                width: 10,
                height: 10,
                background: "var(--bg-elevated)",
                borderLeft: "1px solid var(--border-strong)",
                borderTop: "1px solid var(--border-strong)",
                transform: pos?.above ? "rotate(225deg)" : "rotate(45deg)",
              }}
            />
            {title && (
              <div style={{ fontSize: 13, fontWeight: 650, color: "var(--text-primary)", marginBottom: 8 }}>{title}</div>
            )}
            <div style={{ display: "grid", gap: 8 }}>
              {sections.map((sec) => (
                <div key={sec.label}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--accent-text)",
                      marginBottom: 2,
                    }}
                  >
                    {sec.label}
                  </div>
                  <div>{sec.text}</div>
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
