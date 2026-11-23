/* SeverityCounters — per-severity counts for one run ("3 CRITICAL · 5 WARNING");
   clicking a level filters the run's list to it, clicking it again clears. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { SEVERITY_LEVELS } from "./constants";
import { sevChip, sevGroup } from "./styles";

export function SeverityCounters({
  counts,
  active,
  onSelect,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  onSelect: (severity: Severity) => void;
}) {
  const t = useTranslations("prReview");
  const levels = SEVERITY_LEVELS.filter((sev) => counts[sev] > 0);
  if (levels.length === 0) return null;

  return (
    <div role="group" aria-label={t("panel.severityFilter")} style={sevGroup}>
      {levels.map((sev) => (
        <button
          key={sev}
          type="button"
          aria-pressed={active === sev}
          onClick={() => onSelect(sev)}
          style={sevChip(SEV[sev].c, active === sev)}
        >
          {t("panel.severityCount", { count: counts[sev], label: SEV[sev].label })}
        </button>
      ))}
    </div>
  );
}
