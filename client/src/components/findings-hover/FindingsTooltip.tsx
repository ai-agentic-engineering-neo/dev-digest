/* FindingsTooltip — read-only preview list of one run's findings: severity icon,
   title, category, file:line, confidence and a 2-line rationale. No actions:
   Accept/Dismiss live on the FindingCard in the PR page's Review runs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SeverityBadge, CategoryTag, ConfidenceNum, CAT, type Category } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { lineRef, plainText } from "./helpers";
import { s } from "./styles";

export function FindingsTooltip({
  items,
  total,
  loading = false,
  up = false,
  width = 380,
}: {
  /** Undefined while the findings are still loading. */
  items: FindingRecord[] | undefined;
  /** Count for the header (known before the items load). */
  total: number;
  loading?: boolean;
  up?: boolean;
  width?: number;
}) {
  const t = useTranslations("prReview");
  return (
    <div role="tooltip" style={s.pop(up, width)} onClick={(e) => e.stopPropagation()}>
      <div style={s.popTitle}>
        <Icon.AlertOctagon size={12} />
        {t("findingsHover.title", { count: total })}
      </div>
      {loading || !items ? (
        <div style={s.status}>{t("findingsHover.loading")}</div>
      ) : (
        <div style={s.list}>
          {items.map((f, i) => (
            <div key={f.id} style={s.item(i === items.length - 1)}>
              <div style={s.itemHead}>
                <SeverityBadge severity={f.severity} compact />
                <span style={s.itemTitle}>{f.title}</span>
                {f.category in CAT ? (
                  <CategoryTag category={f.category as Category} />
                ) : (
                  <span style={s.category}>{f.category}</span>
                )}
              </div>
              <div style={s.itemMeta}>
                <span className="mono" style={s.lineRef}>
                  {lineRef(f)}
                </span>
                <ConfidenceNum value={f.confidence} />
              </div>
              <div style={s.rationale}>{plainText(f.rationale)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
