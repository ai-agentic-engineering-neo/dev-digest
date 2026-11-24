/* FindingsPanel — severity counters/filter + hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { applyConfidence, countBySeverity, visibleFindings } from "./helpers";
import { SeverityCounters } from "./SeverityCounters";
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

  const [sevFilter, setSevFilter] = React.useState<Severity | null>(null);

  // Counters reflect the list after "hide low confidence"; a selected level that
  // drops to zero there (its counter disappears) falls back to the full list.
  const counts = React.useMemo(() => countBySeverity(applyConfidence(findings, hideLow)), [findings, hideLow]);
  const activeSev = sevFilter && counts[sevFilter] > 0 ? sevFilter : null;
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, activeSev),
    [findings, hideLow, activeSev],
  );

  // Keep j/k focus inside the (possibly shorter) filtered list: whenever the
  // effective filter (hide-low + active level) changes, focus falls back to the
  // first card. Adjusted during render (react.dev "You Might Not Need an Effect"),
  // which also covers a level filter that drops because its counter emptied.
  const filterKey = `${hideLow}|${activeSev ?? ""}`;
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [focusFilterKey, setFocusFilterKey] = React.useState(filterKey);
  if (focusFilterKey !== filterKey) {
    setFocusFilterKey(filterKey);
    setFocusIdx(0);
  }

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
        <SeverityCounters
          counts={counts}
          active={activeSev}
          onSelect={(sev) => setSevFilter((cur) => (cur === sev ? null : sev))}
        />
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
