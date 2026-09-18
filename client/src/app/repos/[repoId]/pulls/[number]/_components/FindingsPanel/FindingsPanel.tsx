/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, SeverityBadge, type Severity as UiSeverity } from "@devdigest/ui";
import type { FindingRecord, Severity, RepoProvider } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { FILTERABLE_SEVERITIES, KEY_TO_ACTION } from "./constants";
import { severityCounts, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  repoProvider,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  repoProvider?: RepoProvider;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [severityFilter, setSeverityFilter] = React.useState<Severity | null>(null);

  const afterHideLow = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => severityCounts(afterHideLow), [afterHideLow]);
  const shown = React.useMemo(
    () =>
      severityFilter ? afterHideLow.filter((f) => f.severity === severityFilter) : afterHideLow,
    [afterHideLow, severityFilter],
  );

  const toggleSeverity = React.useCallback((sev: Severity) => {
    setSeverityFilter((cur) => (cur === sev ? null : sev));
    setFocusIdx(0);
  }, []);

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
      <div style={s.toolbar}>
        <div style={s.severityBar} role="group" aria-label={t("panel.severityFilterLabel")}>
          {FILTERABLE_SEVERITIES.filter((sev) => counts[sev] > 0 || sev === severityFilter).map((sev) => (
            <button
              key={sev}
              type="button"
              style={s.severityButton(
                severityFilter === sev,
                severityFilter != null && severityFilter !== sev,
              )}
              aria-pressed={severityFilter === sev}
              title={t("panel.severityFilterHint")}
              onClick={() => toggleSeverity(sev)}
            >
              <SeverityBadge severity={sev as UiSeverity} count={counts[sev]} />
            </button>
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
              repoProvider={repoProvider}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
