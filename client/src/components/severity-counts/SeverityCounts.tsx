/* SeverityCounts — per-severity finding chips "ⓘ2 ⚠1 💡2"
   (server/specs/02-findings-by-severity.md). Display only: all chips are one
   hover/focus target (cursor: help) that opens SeverityPopover with every
   finding of that review. Zero counts are not rendered; nothing at all when
   every count is 0. Data comes from the parent — this component never fetches;
   `onHoverStart` tells the parent the popover's findings are wanted. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { CLOSE_GRACE_MS, OPEN_DELAY_MS } from "./constants";
import { SEVERITY_LEVELS, totalOf, type SeverityCountsMap } from "./helpers";
import { SeverityPopover } from "./SeverityPopover";
import { s } from "./styles";

export interface SeverityCountsProps {
  counts: SeverityCountsMap;
  /** Popover content; `undefined` = not loaded yet (renders a skeleton). */
  findings?: FindingRecord[];
  loading?: boolean;
  error?: boolean;
  /** Fired on the first hover/focus — lets the parent load `findings` lazily. */
  onHoverStart?: () => void;
  /** owner/repo + head sha — deep-link each finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
}

export function SeverityCounts({
  counts,
  findings,
  loading,
  error,
  onHoverStart,
  repoFullName,
  headSha,
}: SeverityCountsProps) {
  const t = useTranslations("prReview");
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearTimers = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  };
  const scheduleOpen = () => {
    clearTimers();
    onHoverStart?.();
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  };
  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  };
  const keepOpen = () => clearTimeout(closeTimer.current);

  React.useEffect(() => clearTimers, []);

  // Esc closes; so does scrolling the page (the popover is position: fixed and
  // would drift off its chips) — but not scrolling inside the popover itself.
  React.useEffect(() => {
    if (!open) return;
    const close = () => {
      clearTimers();
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target instanceof Element && target.closest("[data-severity-popover]")) return;
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

  const total = totalOf(counts);
  if (total === 0) return null;

  const levels = SEVERITY_LEVELS.filter((sev) => counts[sev] > 0);
  const breakdown = levels
    .map((sev) => t(`severityCounts.level.${sev}`, { count: counts[sev] }))
    .join(", ");

  return (
    <>
      <span
        ref={triggerRef}
        tabIndex={0}
        aria-label={t("severityCounts.aria", { total, breakdown })}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={s.trigger}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
      >
        {levels.map((sev) => {
          const I = Icon[SEV[sev].icon];
          return (
            <span key={sev} className="tnum" style={s.chip(SEV[sev].c)} aria-hidden>
              <I size={13} />
              {counts[sev]}
            </span>
          );
        })}
      </span>
      {open && triggerRef.current && (
        <SeverityPopover
          anchor={triggerRef.current}
          total={total}
          findings={findings}
          loading={loading}
          error={error}
          repoFullName={repoFullName}
          headSha={headSha}
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleClose}
        />
      )}
    </>
  );
}
