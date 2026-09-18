/* FindingsPreviewCard — hover popover listing the findings behind a severity
   chip cluster: severity, title, category, file:line, confidence and a
   truncated rationale. Shared by the PR list's FINDINGS column and the PR
   detail timeline.

   A popover, not a Modal: no backdrop, no Esc, dismissed by moving the pointer
   away. It is positioned FIXED from a caller-supplied viewport rect because the
   PR-list container clips absolutely-positioned children. */
"use client";

import React from "react";
import { Icon, SeverityBadge, CategoryTag, type Severity, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s, CARD_WIDTH } from "./styles";

export { CARD_WIDTH };

/** Clamp a viewport rect to an on-screen card position. */
export function anchorFrom(rect: DOMRect, viewportWidth: number): { top: number; left: number } {
  return {
    top: rect.bottom + 6,
    left: Math.max(8, Math.min(rect.left, viewportWidth - CARD_WIDTH - 8)),
  };
}

export function FindingsPreviewCard({
  findings,
  title,
  top,
  left,
}: {
  findings: FindingRecord[];
  /** Translated header, e.g. "6 findings" / "2 findings in this run". */
  title: string;
  /** Viewport coordinates of the card's top-left corner. */
  top: number;
  left: number;
}) {
  return (
    <div style={s.card(top, left)} onClick={(e) => e.stopPropagation()}>
      <div style={s.title}>
        <Icon.AlertOctagon size={12} />
        {title}
      </div>
      {findings.map((f, i) => (
        <div key={f.id} style={{ ...s.item, ...(i === 0 ? s.firstItem : {}) }}>
          <div style={s.head}>
            <SeverityBadge severity={f.severity as Severity} compact />
            <span style={s.itemTitle}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
          </div>
          <div style={s.meta}>
            <span className="mono" style={{ color: "var(--accent)" }}>
              {f.file}:{f.start_line}
            </span>
            <span style={s.conf}>{Math.round(f.confidence * 100)}% conf</span>
          </div>
          <div style={s.rationale}>{f.rationale}</div>
        </div>
      ))}
    </div>
  );
}

export default FindingsPreviewCard;
