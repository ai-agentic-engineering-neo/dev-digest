/* FindingsPreviewCard — the hover preview listing a few findings (severity,
   title, category, file:line, confidence, truncated rationale). Shared by the
   PR list's FINDINGS column and the PR detail run timeline, so the two can
   never drift apart. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { lineLabel, sortForPreview, PREVIEW_LIMIT } from "./helpers";
import { s } from "./styles";

export function FindingsPreviewCard({
  findings,
  total,
  title,
  top,
  left,
  loading,
}: {
  /** Findings to preview; sorted and sliced here, so callers pass them raw. */
  findings: FindingRecord[];
  /**
   * Authoritative count for the "+N more" line. The PR list knows the total
   * from its own payload before the findings themselves have loaded; callers
   * that already hold the full list can omit it.
   */
  total?: number;
  /** Already-translated header — the two hosts word it differently. */
  title: string;
  /** Viewport coordinates of the card's top-left corner (see anchorFor). */
  top: number;
  left: number;
  loading?: boolean;
}) {
  const t = useTranslations("prReview");
  const shown = sortForPreview(findings).slice(0, PREVIEW_LIMIT);
  const hidden = (total ?? findings.length) - shown.length;

  return (
    // The card is a DOM child of its anchor so moving the pointer onto it does
    // not fire the anchor's mouseleave; stopPropagation because in the PR list
    // a click anywhere in the row navigates.
    <div style={s.card(top, left)} onClick={(e) => e.stopPropagation()}>
      <div style={s.title}>
        <Icon.AlertOctagon size={12} />
        {title}
      </div>
      {loading && shown.length === 0 && (
        <div style={s.loading}>{t("findingsPreview.loading")}</div>
      )}
      {shown.map((f) => (
        <div key={f.id} style={s.item}>
          <div style={s.head}>
            <SeverityBadge severity={f.severity as Severity} compact />
            <span style={s.itemTitle}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
          </div>
          <div style={s.meta}>
            <span className="mono" style={s.file}>
              {f.file}:{lineLabel(f)}
            </span>
            <ConfidenceNum value={f.confidence} />
          </div>
          <div style={s.rationale}>{f.rationale}</div>
        </div>
      ))}
      {hidden > 0 && <div style={s.more}>{t("findingsPreview.more", { count: hidden })}</div>}
    </div>
  );
}
