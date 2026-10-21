/* FindingsPopover — hover popover for the PR list's FINDINGS column:
   «N FINDINGS IN THIS RUN» + read-only previews (severity icon, title,
   category, file:line, % confidence, short excerpt). Text only — no actions;
   Accept / Reject live on the PR page's Review runs accordion. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, type Severity, type Category } from "@devdigest/ui";
import type { PrFindingPreview } from "@devdigest/shared";
import { s } from "./styles";

export function FindingsPopover({
  total,
  findings,
  anchor,
}: {
  /** Total findings in the latest run (the previews may be capped below this). */
  total: number;
  findings: PrFindingPreview[];
  /** Viewport position of the hovered cell's bottom-left corner. The popover is
   *  `position: fixed` so the table card's `overflow: hidden` cannot clip it. */
  anchor: { top: number; left: number };
}) {
  const t = useTranslations("prReview");
  const hidden = Math.max(0, total - findings.length);
  return (
    <div
      role="dialog"
      aria-label={t("list.findingsPopover.title", { count: total })}
      style={{ ...s.popover, top: anchor.top, left: anchor.left }}
      data-testid="findings-popover"
    >
      <div style={s.title}>{t("list.findingsPopover.title", { count: total })}</div>
      <div style={s.list}>
        {findings.map((f) => (
          <div key={f.id} style={s.item}>
            <div style={s.itemHead}>
              <SeverityBadge severity={f.severity as Severity} compact />
              <span style={s.itemTitle}>{f.title}</span>
            </div>
            <div style={s.itemMeta}>
              <CategoryTag category={f.category as Category} />
              <span className="mono" style={s.itemFile}>
                {f.file}:{f.start_line}
                {f.end_line !== f.start_line ? `-${f.end_line}` : ""}
              </span>
              <span className="tnum" style={s.itemConfidence}>
                {t("list.findingsPopover.confidence", { pct: Math.round(f.confidence * 100) })}
              </span>
            </div>
            {f.excerpt && <p style={s.itemExcerpt}>{f.excerpt}</p>}
          </div>
        ))}
      </div>
      {hidden > 0 && <div style={s.more}>{t("list.findingsPopover.more", { count: hidden })}</div>}
    </div>
  );
}
