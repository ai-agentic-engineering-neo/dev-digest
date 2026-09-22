/* FindingsCell — the PR list's FINDINGS column: one counter per severity,
   still-outstanding findings only (dismissed ones are excluded server-side).

   Hovering the cell — or tab-focusing a counter — opens FindingsHoverCard with
   the PR's full findings list. The counters deliberately carry NO onClick: the
   whole row already navigates to the PR (PRRow.tsx), and a click on a nested
   button bubbles up to it, including the synthetic click Enter/Space fires on a
   focused button. For the same reason a zero counter is muted but never
   `disabled` — a disabled button swallows the click and would punch a dead
   zone into the row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { SeverityCounts } from "@/lib/types";
import { usePrReviews } from "@/lib/hooks/reviews";
import { SEVERITIES } from "../../constants";
import { s } from "../../styles";
import { FindingsHoverCard } from "./FindingsHoverCard";
import { cardFindings, cardPosition, isEmptyCounts } from "./helpers";
import { HOVER_CLOSE_MS, HOVER_OPEN_MS } from "./constants";

export function FindingsCell({
  counts,
  prId,
  prNumber,
  onOpenChange,
}: {
  counts?: SeverityCounts | null;
  prId?: string | null;
  prNumber: number;
  /** Lets the row keep its hover background while the portalled card is open. */
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations("prReview");
  const groupRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  // Latched on the first hover and never unset: nothing is fetched until the
  // user shows interest, and afterwards the query stays mounted so re-hovering
  // is instant (staleTime 30s keeps it from refetching mid-sweep).
  const [primed, setPrimed] = React.useState(false);

  const hasCard = counts != null && !isEmptyCounts(counts);
  const { data: reviews, isLoading, isError } = usePrReviews(primed && prId ? prId : null);
  const findings = React.useMemo(() => cardFindings(reviews), [reviews]);

  const cardId = `pr-findings-${prNumber}`;
  const open = pos != null;

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const close = React.useCallback(() => {
    clearTimers();
    setPos(null);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const place = React.useCallback(() => {
    const rect = groupRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(cardPosition(rect, { width: window.innerWidth, height: window.innerHeight }));
    onOpenChange?.(true);
  }, [onOpenChange]);

  const scheduleOpen = (delay: number) => {
    if (!hasCard || !prId) return;
    setPrimed(true);
    clearTimers();
    openTimer.current = setTimeout(place, delay);
  };

  const scheduleClose = () => {
    clearTimers();
    closeTimer.current = setTimeout(close, HOVER_CLOSE_MS);
  };

  React.useEffect(() => clearTimers, []);

  // A fixed-position card anchored to a scrolling table would drift, so close
  // instead of chasing it. Escape closes too, leaving focus on the counter.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Never reviewed → the same em dash the SCORE column shows, and no card.
  if (counts == null) {
    return (
      <div style={s.findingsCell}>
        <span style={s.muted} title={t("list.findings.notReviewed")}>
          —
        </span>
      </div>
    );
  }

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={t("list.columns.findings")}
      onMouseEnter={() => scheduleOpen(HOVER_OPEN_MS)}
      onMouseLeave={scheduleClose}
      style={s.findingsCell}
    >
      {SEVERITIES.map(({ key, countKey }) => {
        const n = counts[countKey];
        const sev = SEV[key];
        const I = Icon[sev.icon];
        return (
          <button
            key={key}
            type="button"
            onFocus={() => scheduleOpen(0)}
            onBlur={scheduleClose}
            aria-label={t("list.findings.aria", {
              severity: t(`severity.${countKey}`),
              count: n,
            })}
            aria-describedby={open ? cardId : undefined}
            style={s.sevBtn(sev.c, n === 0)}
          >
            <I size={13} />
            <span className="tnum">{n}</span>
          </button>
        );
      })}

      {open && pos && (
        <FindingsHoverCard
          id={cardId}
          findings={findings}
          isLoading={isLoading}
          isError={isError}
          top={pos.top}
          left={pos.left}
          onMouseEnter={clearTimers}
          onMouseLeave={scheduleClose}
        />
      )}
    </div>
  );
}
