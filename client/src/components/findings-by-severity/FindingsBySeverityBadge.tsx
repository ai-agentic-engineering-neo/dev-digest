/* FindingsBySeverityBadge — reusable severity-count trigger + read-only hover
   popover. Used in three places with three different data scopes:
     (A) PR list row — counts aggregated across the PR's latest review only.
     (B) PR Detail Agent-runs Timeline tile — counts for that one run only.
     (C) PR Detail Review-run accordion HEADER — active findings of that run.
   HOVER behaviour is identical everywhere: it opens a read-only popover listing
   the underlying findings (title "N FINDINGS IN THIS RUN"). No accept/dismiss
   controls anywhere in this component — it is a preview surface only.

   CLICK behaviour is deliberately per-call-site (see client/specs/README.md):
     - no `onSeverityClick`  → pin the popover + narrow it locally (the original
       behaviour; unchanged, and the safe default for any future caller).
     - `onSeverityClick` alone (A, B) → fire the callback ONLY. Both of those
       call sites navigate away (cross-page push / jump to the run accordion),
       so also pinning a popover the user is about to leave is pointless.
     - `onSeverityClick` + `pinOnClick` (C) → fire the callback AND keep the
       local pin/narrow. That call site is already AT the Review-runs section,
       so the popover stays useful while the URL is synced for sharing.

   NOTE: this component is NOT `FindingsPanel`'s `SeverityFilterPills` — that is
   a separate widget with its own click-to-filter contract (see
   client/specs/README.md for how its filter is mirrored into the URL). */
"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import type { Severity, FindingRecord } from "@devdigest/shared";
import { SEVERITY_ORDER, CLOSE_DELAY_MS } from "./constants";
import { SeverityFindingsPopover } from "./SeverityFindingsPopover";
import { s } from "./styles";

export function FindingsBySeverityBadge({
  counts,
  findings,
  onOpenChange,
  compact,
  onSeverityClick,
  pinOnClick = false,
}: {
  counts: Record<Severity, number>;
  /** undefined while the popover's content is still (lazily) loading. */
  findings: FindingRecord[] | undefined;
  onOpenChange?: (open: boolean) => void;
  compact?: boolean;
  /** Per-call-site click contract — see this file's header comment. */
  onSeverityClick?: (sev: Severity) => void;
  /** Only meaningful alongside `onSeverityClick`: also keep the local
   *  pin + narrow (call site C). Ignored when `onSeverityClick` is absent,
   *  where pin + narrow is already the behaviour. */
  pinOnClick?: boolean;
}) {
  const total = SEVERITY_ORDER.reduce((sum, sev) => sum + counts[sev], 0);

  const triggerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [open, setOpen] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [filter, setFilter] = React.useState<Severity | null>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const doOpen = () => {
    clearCloseTimer();
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPosition({ top: r.bottom + 6, left: r.left });
    }
    setOpen(true);
    onOpenChange?.(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setPinned(false);
      setFilter(null);
      onOpenChange?.(false);
    }, CLOSE_DELAY_MS);
  };

  const closeNow = () => {
    clearCloseTimer();
    setOpen(false);
    setPinned(false);
    setFilter(null);
    onOpenChange?.(false);
  };

  // Escape + click-outside (both trigger and portaled panel), only while open.
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeNow();
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      closeNow();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => clearCloseTimer, []);

  if (total === 0) {
    return (
      <span data-testid="findings-badge-empty" style={s.empty}>
        —
      </span>
    );
  }

  return (
    <div
      ref={triggerRef}
      style={s.row}
      onMouseEnter={doOpen}
      onMouseLeave={() => {
        if (!pinned) scheduleClose();
      }}
    >
      {SEVERITY_ORDER.filter((sev) => counts[sev] > 0).map((sev) => (
        <button
          key={sev}
          type="button"
          aria-pressed={filter === sev}
          aria-expanded={open}
          aria-haspopup="true"
          // Hovering a severity icon previews ONLY that severity's findings.
          // A click-pinned filter wins until the popover closes.
          onMouseEnter={() => {
            if (!pinned) setFilter(sev);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSeverityClick?.(sev);
            // Skip the local pin/narrow only when a caller has taken over the
            // click AND hasn't opted back into keeping it (call sites A and B).
            if (onSeverityClick && !pinOnClick) return;
            // Hover already narrowed to `sev`, so the first click pins it;
            // only re-clicking an already-PINNED chip clears the narrowing.
            const clearing = pinned && filter === sev;
            setPinned(true);
            if (!open) doOpen();
            setFilter(clearing ? null : sev);
          }}
          style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          <SeverityBadge severity={sev} count={counts[sev]} compact={compact} />
        </button>
      ))}
      {open && position && (
        <SeverityFindingsPopover
          position={position}
          findings={findings}
          filter={filter}
          panelRef={panelRef}
          onMouseEnter={clearCloseTimer}
          onMouseLeave={() => {
            if (!pinned) scheduleClose();
          }}
        />
      )}
    </div>
  );
}
