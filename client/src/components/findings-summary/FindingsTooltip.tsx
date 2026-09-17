/* FindingsTooltip — hover preview of a review's findings (severity, title,
   category, file:line, confidence, 2-line rationale). Ported from the design's
   FindingsTooltip. Positioned `fixed` so it escapes the PR table's
   `overflow: hidden` card. */
"use client";

import { useTranslations } from "next-intl";
import { CategoryTag, ConfidenceNum, SeverityBadge } from "@devdigest/ui";
import type { FindingPreview } from "@devdigest/shared";
import { s } from "./styles";

export interface TooltipPosition {
  top: number;
  left: number;
  above: boolean;
}

function location(f: FindingPreview): string {
  return f.end_line > f.start_line
    ? `${f.file}:${f.start_line}-${f.end_line}`
    : `${f.file}:${f.start_line}`;
}

export function FindingsTooltip({
  id,
  items,
  position,
  onMouseEnter,
  onMouseLeave,
}: {
  id: string;
  items: FindingPreview[];
  position: TooltipPosition;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const t = useTranslations("common");
  return (
    <div
      id={id}
      role="tooltip"
      style={s.tooltip(position.top, position.left, position.above)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      // Clicking inside the preview must not trigger the host row's navigation.
      onClick={(e) => e.stopPropagation()}
    >
      <div style={s.tooltipHeader}>{t("findingsSummary.header", { count: items.length })}</div>
      {items.map((f) => (
        <div key={f.id} style={s.item}>
          <div style={s.itemTop}>
            <SeverityBadge severity={f.severity} compact />
            <span style={s.itemTitle} title={f.title}>
              {f.title}
            </span>
            <CategoryTag category={f.category} />
          </div>
          <div style={s.itemMeta}>
            <span className="mono" style={s.itemLocation} title={location(f)}>
              {location(f)}
            </span>
            <ConfidenceNum value={f.confidence} />
          </div>
          <div style={s.itemRationale}>{f.rationale}</div>
        </div>
      ))}
    </div>
  );
}
