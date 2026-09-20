/* FindingsPanel — hide-low-confidence + severity filter + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "@/lib/api/reviews";
import { SeverityFilterChip } from "./_components/SeverityFilterChip";
import { KEY_TO_ACTION, SEVERITY_FILTERS } from "./constants";
import { severityCounts, visibleFindings } from "./helpers";
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
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Counts reflect hideLow but not the severity filter itself — each pill's
  // number always equals the cards that appear when that pill is clicked.
  const counted = React.useMemo(() => visibleFindings(findings, hideLow, null), [findings, hideLow]);
  const counts = React.useMemo(() => severityCounts(counted), [counted]);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );

  // Filter changes reset keyboard focus back to the top — done in the
  // handlers below (setHideLow/setSeverity) rather than an effect, since it's
  // a direct response to those events, not a sync with anything external.
  const toggleHideLow = (v: boolean) => {
    setHideLow(v);
    setFocusIdx(0);
  };
  const toggleSeverity = (sev: Severity) => {
    setSeverity((cur) => (cur === sev ? null : sev));
    setFocusIdx(0);
  };

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

  const presentSeverities = SEVERITY_FILTERS.filter((sev) => (counts[sev] ?? 0) > 0);

  return (
    <div>
      <div style={s.toolbar}>
        {presentSeverities.length > 0 && (
          <div style={s.pillRow}>
            {presentSeverities.map((sev) => (
              <SeverityFilterChip
                key={sev}
                severity={sev}
                count={counts[sev]!}
                active={severity === sev}
                onClick={() => toggleSeverity(sev)}
              />
            ))}
          </div>
        )}
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={toggleHideLow} size={16} />
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
