/* SeverityCounters — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" toggle chips;
   clicking a level filters the panel to it, clicking it again clears. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { FILTERABLE_SEVERITIES } from "../../constants";
import { s } from "./styles";

export function SeverityCounters({
  counts,
  active,
  onSelect,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  onSelect: (severity: Severity | null) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("panel.severityFilterLabel")} style={s.group}>
      {FILTERABLE_SEVERITIES.map((sev, i) => (
        <React.Fragment key={sev}>
          {i > 0 && (
            <span aria-hidden style={s.separator}>
              ·
            </span>
          )}
          <Chip
            icon={SEV[sev].icon}
            color={SEV[sev].c}
            active={active === sev}
            disabled={counts[sev] === 0 && active !== sev}
            onClick={() => onSelect(active === sev ? null : sev)}
          >
            <span className="tnum">{counts[sev]}</span> {sev}
          </Chip>
        </React.Fragment>
      ))}
    </div>
  );
}
