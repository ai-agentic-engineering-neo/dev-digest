/* FindingsPopover — hover/focus the wrapped severity icons to see a read-only
   list of the run's findings. Rendered in a portal with fixed positioning so
   clipping containers (the PR list card has overflow:hidden) don't cut it.
   Clicks inside never reach the row underneath (no navigation / trace open). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingPreview } from "./FindingPreview";
import { SEVERITY_KEYS } from "./helpers";
import {
  POPOVER_CLOSE_DELAY_MS,
  POPOVER_GAP,
  POPOVER_MAX_HEIGHT,
  POPOVER_WIDTH,
} from "./constants";
import { s } from "./styles";

type Pos = { top: number; left: number; maxHeight: number };

function placeBelowOrAbove(rect: DOMRect): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(rect.left, vw - POPOVER_WIDTH - 8));
  const below = vh - rect.bottom - POPOVER_GAP - 8;
  const above = rect.top - POPOVER_GAP - 8;
  if (below >= Math.min(POPOVER_MAX_HEIGHT, 240) || below >= above) {
    return { top: rect.bottom + POPOVER_GAP, left, maxHeight: Math.min(POPOVER_MAX_HEIGHT, below) };
  }
  const maxHeight = Math.min(POPOVER_MAX_HEIGHT, above);
  return { top: rect.top - POPOVER_GAP - maxHeight, left, maxHeight };
}

export function FindingsPopover({
  findings,
  count,
  variant,
  isLoading = false,
  onOpen,
  children,
}: {
  /** Findings to preview; undefined while not loaded yet. */
  findings: FindingRecord[] | undefined;
  /** Header count (known up front, e.g. from list severity_counts). */
  count: number;
  /** "run" → "N findings" (timeline); "list" → "N findings in this run" (PR list). */
  variant: "run" | "list";
  isLoading?: boolean;
  /** Fired when the popover opens — lets the PR list lazy-load findings. */
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("common.findingsPopover");
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = React.useState<Pos | null>(null);
  const open = pos != null;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => {
    cancelClose();
    if (open || !triggerRef.current) return;
    setPos(placeBelowOrAbove(triggerRef.current.getBoundingClientRect()));
    onOpen?.();
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPos(null), POPOVER_CLOSE_DELAY_MS);
  };

  React.useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // The panel is position:fixed, so a PAGE scroll would detach it from the
    // trigger → close. Scrolling the panel's own list must keep it open.
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      close();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  React.useEffect(() => cancelClose, []);

  const sorted = React.useMemo(
    () =>
      findings
        ? [...findings].sort(
            (a, b) =>
              SEVERITY_KEYS.indexOf(a.severity) - SEVERITY_KEYS.indexOf(b.severity),
          )
        : undefined,
    [findings],
  );
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={scheduleClose}
        onClick={stop}
        onKeyDown={stop}
        style={s.trigger}
      >
        {children}
      </span>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t(variant, { count })}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClick={stop}
            onMouseDown={stop}
            style={s.panel(pos.top, pos.left, pos.maxHeight)}
          >
            <div style={s.header}>
              <Icon.Info size={13} />
              {t(variant, { count })}
            </div>
            {isLoading || !sorted ? (
              <div style={s.muted}>{t("loading")}</div>
            ) : sorted.length === 0 ? (
              <div style={s.muted}>{t("empty")}</div>
            ) : (
              sorted.map((f, i) => <FindingPreview key={f.id} f={f} first={i === 0} />)
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
