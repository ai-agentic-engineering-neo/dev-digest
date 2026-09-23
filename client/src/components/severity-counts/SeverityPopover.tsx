/* SeverityPopover — the hover card behind SeverityCounts: "ⓘ N FINDINGS" and
   every finding of that review, most severe first. Portalled to <body> with
   fixed positioning because the PR list's table card clips its overflow; flips
   above the chips when there is no room below. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  CategoryTag,
  ConfidenceNum,
  Icon,
  SeverityBadge,
  Skeleton,
  type Category,
  type Severity as UiSeverity,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { POPOVER_GAP, POPOVER_MAX_HEIGHT, POPOVER_WIDTH, VIEWPORT_MARGIN } from "./constants";
import { lineLabel, plainText, sortBySeverity } from "./helpers";
import { s } from "./styles";

export interface SeverityPopoverProps {
  anchor: HTMLElement;
  total: number;
  findings?: FindingRecord[];
  loading?: boolean;
  error?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function SeverityPopover({
  anchor,
  total,
  findings,
  loading,
  error,
  repoFullName,
  headSha,
  onMouseEnter,
  onMouseLeave,
}: SeverityPopoverProps) {
  const t = useTranslations("prReview");
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const sorted = React.useMemo(() => (findings ? sortBySeverity(findings) : null), [findings]);

  // Measure after render (content height changes once findings load). Below the
  // chips by default; above when it doesn't fit below and there is more room
  // above; either way capped to the room it gets, so it never covers the chips.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const a = anchor.getBoundingClientRect();
    const wanted = Math.min(el.scrollHeight + 2, POPOVER_MAX_HEIGHT); // +2: borders
    const roomBelow = window.innerHeight - a.bottom - POPOVER_GAP - VIEWPORT_MARGIN;
    const roomAbove = a.top - POPOVER_GAP - VIEWPORT_MARGIN;
    const above = roomBelow < wanted && roomAbove > roomBelow;
    const maxHeight = Math.max(0, Math.min(POPOVER_MAX_HEIGHT, above ? roomAbove : roomBelow));
    const top = above ? a.top - POPOVER_GAP - Math.min(wanted, maxHeight) : a.bottom + POPOVER_GAP;
    const maxLeft = window.innerWidth - Math.min(POPOVER_WIDTH, window.innerWidth) - VIEWPORT_MARGIN;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(a.left, maxLeft));
    setPos((p) =>
      p && p.top === top && p.left === left && p.maxHeight === maxHeight ? p : { top, left, maxHeight },
    );
  }, [anchor, sorted, loading, error]);

  let body: React.ReactNode;
  if (error) {
    body = <div style={s.status}>{t("severityCounts.error")}</div>;
  } else if (!sorted) {
    body = (
      <div style={s.skeletons} aria-label={t("severityCounts.loading")}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={i === 0 ? 16 : 12} width={i === 2 ? "70%" : "100%"} />
        ))}
      </div>
    );
  } else {
    body = sorted.map((f, i) => {
      const dismissed = !!f.dismissed_at;
      const where = `${f.file}:${lineLabel(f)}`;
      return (
        <div key={f.id} style={s.item(i === 0)}>
          <div style={s.titleRow}>
            <span style={s.badgeSlot}>
              <SeverityBadge severity={f.severity as UiSeverity} compact />
            </span>
            <span style={s.title(dismissed)}>{f.title}</span>
            <span style={s.categorySlot}>
              <CategoryTag category={f.category as Category} />
            </span>
          </div>
          <div style={s.metaRow}>
            {repoFullName && headSha ? (
              <a
                className="mono"
                href={githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)}
                target="_blank"
                rel="noopener noreferrer"
                style={s.fileLink}
              >
                {where}
              </a>
            ) : (
              <span className="mono" style={s.fileLink}>
                {where}
              </span>
            )}
            <span style={s.confidence}>
              <ConfidenceNum value={f.confidence} />
            </span>
          </div>
          <div style={s.rationale}>{plainText(f.rationale)}</div>
        </div>
      );
    });
  }

  return createPortal(
    <div
      ref={ref}
      data-severity-popover
      role="dialog"
      aria-label={t("severityCounts.header", { count: total })}
      style={s.popover(pos)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      // React bubbles portal events to React ancestors — e.g. the PR list
      // row, whose onClick would open the PR.
      onClick={(e) => e.stopPropagation()}
    >
      <div style={s.header}>
        <Icon.AlertOctagon size={13} />
        {t("severityCounts.header", { count: total })}
      </div>
      {body}
    </div>,
    document.body,
  );
}
