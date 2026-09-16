/* FindingsCounter — "N CRITICAL · N WARNING · N SUGGESTION" style counter,
   shown in the PR-list Findings column and the Agent-runs Timeline. Hovering
   (or focusing, for keyboard users) opens a read-only FindingsPopover; the
   numbers are a plain COUNT/filter over already-loaded findings, no LLM call
   and no extra network request. Lives inside a clickable PR row, so every
   interaction here stops propagation to avoid triggering row navigation. */
"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import type { Severity } from "@devdigest/ui";
import type { SeverityCounts } from "@devdigest/shared";
import { SEVERITIES, totalCount, type FindingPreviewLike } from "./helpers";
import { FindingsPopover } from "./FindingsPopover";

const HIDE_DELAY_MS = 120;

export function FindingsCounter({
  counts,
  items,
  popoverTitle,
}: {
  counts: SeverityCounts;
  items: FindingPreviewLike[];
  popoverTitle: string;
}) {
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const show = () => {
    clearHideTimer();
    setOpen(true);
  };
  // Small delay so the cursor can travel from the trigger into the popover
  // (e.g. to scroll a long list) without it closing mid-move.
  const scheduleHide = () => {
    clearHideTimer();
    hideTimer.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
  };

  React.useEffect(() => clearHideTimer, []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const total = totalCount(counts);
  if (total === 0) {
    return <span style={{ color: "var(--text-muted)" }}>0</span>;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
        onFocus={show}
        onBlur={scheduleHide}
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "default",
        }}
      >
        {SEVERITIES.filter((sev) => counts[sev] > 0).map((sev) => (
          <SeverityBadge key={sev} severity={sev as Severity} count={counts[sev]} compact />
        ))}
      </button>
      {open && triggerRef.current && (
        <FindingsPopover
          anchor={triggerRef.current}
          title={popoverTitle}
          items={items}
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        />
      )}
    </>
  );
}
