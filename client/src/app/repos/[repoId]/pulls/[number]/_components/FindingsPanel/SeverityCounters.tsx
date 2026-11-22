/* SeverityCounters — one chip per severity level of a run ("3 WARNING").
   Click filters the list to that level; clicking the active chip clears it.
   Counts are computed by the parent from the already-loaded findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Severity } from "@devdigest/shared";
import { visibleLevels } from "./helpers";
import { s, severityChip } from "./styles";

export function SeverityCounters({
  counts,
  active,
  onToggle,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  onToggle: (level: Severity) => void;
}) {
  const t = useTranslations("prReview");
  const levels = visibleLevels(counts, active);
  if (levels.length === 0) return null;

  return (
    <div role="group" aria-label={t("panel.severity.groupLabel")} style={s.severityGroup}>
      {levels.map((level) => {
        const isActive = level === active;
        return (
          <button
            key={level}
            type="button"
            aria-pressed={isActive}
            className="tnum"
            style={severityChip(level, isActive)}
            onClick={() => onToggle(level)}
          >
            {t(`panel.severity.${level}`, { count: counts[level] })}
          </button>
        );
      })}
    </div>
  );
}
