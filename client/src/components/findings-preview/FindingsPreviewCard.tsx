/* FindingsPreviewCard — read-only hover popover listing findings (severity,
   title, category, file:line, confidence, truncated rationale). No buttons:
   this is a preview, not the accordion's actionable FindingCard. */
"use client";

import { SeverityBadge, CategoryTag, type Severity, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { s } from "./styles";

export function FindingsPreviewCard({
  findings,
  title,
  top,
  left,
}: {
  findings: FindingRecord[];
  /** Fully-formatted header, e.g. "6 FINDINGS IN THIS RUN". */
  title: string;
  /** Viewport coordinates of the card's top-left corner (position: fixed). */
  top: number;
  left: number;
}) {
  return (
    <div style={s.card(top, left)} onClick={(e) => e.stopPropagation()}>
      <div style={s.title}>{title}</div>
      {findings.map((f) => (
        <div key={f.id} style={s.item}>
          <div style={s.head}>
            <SeverityBadge severity={f.severity as Severity} compact />
            <span style={s.itemTitle}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
          </div>
          <div style={s.meta}>
            <span className="mono" style={s.fileLine}>
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
