/* SeverityFilterPills — "N Critical · N Warning · N Suggestion" under a run's
   verdict. Only severities that exist are shown; clicking a pill filters the
   run's findings to that severity, clicking the active pill clears it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity, SeverityCounts } from "@devdigest/shared";
import { SEVERITY_KEYS } from "@/components/finding-severity";
import { s } from "./styles";

export function SeverityFilterPills({
  counts,
  active,
  onChange,
}: {
  counts: SeverityCounts;
  active: Severity | null;
  onChange: (next: Severity | null) => void;
}) {
  const t = useTranslations("prReview.panel.severityFilter");
  const present = SEVERITY_KEYS.filter((k) => counts[k] > 0);
  if (present.length === 0) return null;
  return (
    <div role="group" aria-label={t("label")} style={s.group}>
      {present.map((k) => {
        const on = active === k;
        const I = Icon[SEV[k].icon];
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : k)}
            style={s.pill(on, SEV[k].c, SEV[k].bg)}
          >
            <I size={13} />
            {t(k, { count: counts[k] })}
          </button>
        );
      })}
    </div>
  );
}
