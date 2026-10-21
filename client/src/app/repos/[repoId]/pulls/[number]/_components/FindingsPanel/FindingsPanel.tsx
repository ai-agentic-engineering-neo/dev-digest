/* FindingsPanel — severity counters («N CRITICAL · N WARNING · N SUGGESTION»),
   per-severity filter buttons, hide-low-confidence, j/k navigation and the
   FindingCard list, wiring the accept/reject action hook (A2). Counters and
   filters are plain COUNT/filter over the run's persisted findings. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, SeverityBadge, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { FILTERABLE_SEVERITIES, KEY_TO_ACTION, type FilterableSeverity } from "./constants";
import { countBySeverity, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<FilterableSeverity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const present = FILTERABLE_SEVERITIES.filter((sev) => counts[sev] > 0);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );
  // Clicking the active filter again clears it (back to the full list).
  const toggleSeverity = (sev: FilterableSeverity) => setSeverity((cur) => (cur === sev ? null : sev));

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      {present.length > 0 && (
        <div style={s.severityRow} data-testid="severity-counts" aria-label={t("panel.severityCounts")}>
          {present.map((sev, i) => (
            <React.Fragment key={sev}>
              {i > 0 && <span style={s.severitySep}>·</span>}
              <SeverityBadge severity={sev} count={counts[sev]} />
            </React.Fragment>
          ))}
        </div>
      )}
      <div style={s.toolbar}>
        <div style={s.filterRow} role="group" aria-label={t("panel.filterBySeverity")}>
          {FILTERABLE_SEVERITIES.map((sev) => (
            <Chip
              key={sev}
              icon={SEV[sev].icon}
              color={SEV[sev].c}
              active={severity === sev}
              count={counts[sev]}
              onClick={() => toggleSeverity(sev)}
            >
              {t(`panel.filter.${sev.toLowerCase()}`)}
            </Chip>
          ))}
        </div>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
