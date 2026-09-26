/* FindingsSummary — the PR's findings at a glance, above the Review runs
   section: one counter per severity over EVERY run's findings, i.e. the whole
   lifetime. This is deliberately NOT the PR list's FINDINGS column, which counts
   only each agent's latest review; here every run is on screen in the timeline,
   so the counters have to add up to all of them. Each counter is a toggle:
   clicking one filters every run's panel down to that severity. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { countBySeverity, PREVIEW_SEVERITIES } from "@/components/findings-preview";
import { s } from "./styles";

export function FindingsSummary({
  findings,
  severityFilter,
  onSeverityChange,
}: {
  /** Every finding on the PR — counts are always of the FULL set, never of
   *  what the current filter leaves visible. */
  findings: FindingRecord[];
  severityFilter: string | null;
  onSeverityChange: (severity: string | null) => void;
}) {
  const t = useTranslations("prReview");
  const counts = countBySeverity(findings);
  const shown = PREVIEW_SEVERITIES.filter((sev) => counts[sev] > 0);
  if (shown.length === 0) return null;

  return (
    <div style={s.group} role="group" aria-label={t("panel.severityCounters")}>
      {shown.map((sev) => {
        const active = severityFilter === sev;
        return (
          <button
            key={sev}
            type="button"
            aria-pressed={active}
            aria-label={
              active ? t("panel.showAllSeverities") : t("panel.showOnlySeverity", { severity: sev })
            }
            onClick={() => onSeverityChange(active ? null : sev)}
            style={{
              ...s.button,
              ...(active ? s.buttonActive : {}),
              ...(severityFilter && !active ? s.buttonMuted : {}),
            }}
          >
            <SeverityBadge severity={sev as Severity} count={counts[sev]} />
          </button>
        );
      })}
    </div>
  );
}
