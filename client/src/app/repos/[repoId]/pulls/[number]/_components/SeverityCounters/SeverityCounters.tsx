/* SeverityCounters — per-run severity distribution ("1 CRITICAL · 3 WARNING")
   that doubles as a single-select filter. Each pill holds two SIBLING buttons
   (filter + ⓘ details) — a <button> may not contain another <button>. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import type { SeverityCount } from "../types";
import { s } from "./styles";

export function SeverityCounters({
  counts,
  active,
  onSelect,
  onOpenDetails,
}: {
  counts: SeverityCount[];
  active: Severity | null;
  onSelect: (severity: Severity | null) => void;
  onOpenDetails: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  if (counts.length === 0) return null;

  return (
    <div role="group" aria-label={t("panel.severityFilterLabel")} style={s.row}>
      {counts.map(({ severity, count }) => {
        const isActive = active === severity;
        return (
          <span key={severity} style={s.pill(SEV[severity].c, isActive)} data-severity={severity}>
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(isActive ? null : severity)}
              style={s.main}
            >
              {count} {severity}
            </button>
            <button
              type="button"
              aria-label={t("panel.showSeverityFindings", { severity })}
              title={t("panel.showSeverityFindings", { severity })}
              onClick={() => onOpenDetails(severity)}
              style={s.info}
            >
              <Icon.Info size={13} />
            </button>
          </span>
        );
      })}
      {active && (
        <Button kind="ghost" size="sm" icon="X" onClick={() => onSelect(null)}>
          {t("panel.clearFilter")}
        </Button>
      )}
    </div>
  );
}
