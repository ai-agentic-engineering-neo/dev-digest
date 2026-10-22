/* SeverityCounts — per-severity finding counters ("3 CRITICAL · 5 WARNING · 2
   SUGGESTION"). `compact` = icon + number (PR list, timeline); `full` = icon +
   number + label (PR summary bar). Hover/focus opens a FindingsPopover: the
   whole set for `compact`, the hovered level only for `full`. With `onSelect`
   each level is a toggle button (severity filter). The popover is portalled
   with fixed positioning so `overflow: hidden` containers can't clip it. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity, SeverityCounts as Counts } from "@devdigest/shared";
import { FindingsPopover } from "./FindingsPopover";
import { SEVERITIES, findingsForPopover } from "./helpers";

const POPOVER_WIDTH = 440;
const POPOVER_EST_HEIGHT = 380;
const CLOSE_DELAY_MS = 120;

type Open = { scope: Severity | null; rect: DOMRect };

export function SeverityCounts({
  counts,
  variant = "compact",
  findings,
  loading = false,
  active = null,
  onSelect,
  onOpenChange,
}: {
  counts: Counts | null | undefined;
  variant?: "compact" | "full";
  /** Findings shown in the hover popover; omit to disable the popover. */
  findings?: FindingRecord[];
  /** Popover shows a skeleton (findings are being fetched lazily). */
  loading?: boolean;
  /** Currently filtered level (rendered pressed; the others dimmed). */
  active?: Severity | null;
  /** Makes each level a toggle button. */
  onSelect?: (sev: Severity) => void;
  /** Fires when the popover opens/closes — lets callers fetch on demand. */
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("prReview.severityCounts");
  const groupRef = React.useRef<HTMLSpanElement | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState<Open | null>(null);
  const popoverEnabled = findings !== undefined || loading;

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const close = React.useCallback(() => {
    setOpen(null);
    onOpenChange?.(false);
  }, [onOpenChange]);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(close, CLOSE_DELAY_MS);
  };
  const show = (sev: Severity, el: HTMLElement) => {
    if (!popoverEnabled) return;
    cancelClose();
    const anchor = variant === "full" ? el : groupRef.current ?? el;
    setOpen({ scope: variant === "full" ? sev : null, rect: anchor.getBoundingClientRect() });
    onOpenChange?.(true);
  };

  // Escape or any scroll closes the (fixed-position) popover.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [open, close]);
  React.useEffect(() => cancelClose, []);

  const levels = SEVERITIES.filter((sev) => (counts?.[sev] ?? 0) > 0);
  if (!counts || levels.length === 0) return null;

  const full = variant === "full";
  return (
    <span
      ref={groupRef}
      style={{ display: "inline-flex", alignItems: "center", gap: full ? 6 : 10, flexWrap: "wrap" }}
      onClick={(e) => e.stopPropagation()}
    >
      {levels.map((sev, i) => {
        const meta = SEV[sev];
        const SevIcon = Icon[meta.icon];
        const count = counts[sev];
        const pressed = active === sev;
        const dimmed = active != null && !pressed;
        const label = t(sev);
        const common = {
          "aria-label": onSelect ? t("filterAria", { count, level: label }) : t("levelAria", { count, level: label }),
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(sev, e.currentTarget),
          onMouseLeave: scheduleClose,
          onFocus: (e: React.FocusEvent<HTMLElement>) => show(sev, e.currentTarget),
          onBlur: scheduleClose,
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: full ? "3px 9px" : 0,
            borderRadius: 5,
            border: full ? `1px solid ${pressed ? meta.c : "var(--border)"}` : "none",
            background: full && pressed ? meta.bg : "transparent",
            color: meta.c,
            font: "inherit",
            fontSize: full ? 12 : 12.5,
            fontWeight: 600,
            letterSpacing: full ? "0.04em" : undefined,
            opacity: dimmed ? 0.5 : 1,
            cursor: onSelect ? "pointer" : "default",
            textDecoration: !full && popoverEnabled ? "underline dotted" : "none",
            textUnderlineOffset: 3,
            transition: "opacity .1s, background .1s",
          } satisfies React.CSSProperties,
        };
        const body = (
          <>
            <SevIcon size={full ? 12.5 : 13} />
            <span className="tnum">{count}</span>
            {full && <span style={{ textTransform: "uppercase" }}>{label}</span>}
          </>
        );
        return (
          <React.Fragment key={sev}>
            {full && i > 0 && <span style={{ color: "var(--text-muted)" }}>·</span>}
            {onSelect ? (
              <button type="button" aria-pressed={pressed} onClick={() => onSelect(sev)} {...common}>
                {body}
              </button>
            ) : (
              <span tabIndex={popoverEnabled ? 0 : undefined} {...common}>
                {body}
              </span>
            )}
          </React.Fragment>
        );
      })}

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="tooltip"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onClick={(e) => e.stopPropagation()}
            style={popoverPosition(open.rect)}
          >
            <FindingsPopover findings={findingsForPopover(findings ?? [], open.scope)} loading={loading} />
          </div>,
          document.body,
        )}
    </span>
  );
}

/** Below the anchor (above if it would overflow), clamped to the viewport. */
function popoverPosition(rect: DOMRect): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(12, Math.min(rect.left, vw - POPOVER_WIDTH - 12));
  const above = rect.bottom + 6 + POPOVER_EST_HEIGHT > vh && rect.top > POPOVER_EST_HEIGHT;
  return {
    position: "fixed",
    zIndex: 1000,
    left,
    ...(above ? { bottom: vh - rect.top + 6 } : { top: rect.bottom + 6 }),
  };
}
