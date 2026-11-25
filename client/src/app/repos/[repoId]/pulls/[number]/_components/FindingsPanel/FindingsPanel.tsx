/* FindingsPanel — severity counters/filter + hide-low-confidence + j/k
   navigation + FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SeverityCounters } from "../SeverityCounters";
import { SeverityFindingsModal } from "../SeverityFindingsModal";
import { useFindingAction } from "@/lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { countBySeverity, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  agentName,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Shown as the subtitle of the per-severity findings modal. */
  agentName?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const [detailsFor, setDetailsFor] = React.useState<Severity | null>(null);

  // Counts always reflect the whole run — hide-low only affects the list.
  const counts = React.useMemo(() => countBySeverity(findings), [findings]);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );

  // A filter on a severity the run no longer has would show an unexplained empty list.
  React.useEffect(() => {
    if (severity && !counts.some((c) => c.severity === severity)) setSeverity(null);
  }, [counts, severity]);

  React.useEffect(() => setFocusIdx(0), [severity, hideLow]);

  const closeDetails = React.useCallback(() => setDetailsFor(null), []);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // The modal owns the keyboard while open — never accept/dismiss behind it.
      if (detailsFor) return;
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
  }, [shown, focusIdx, action, prId, detailsFor]);

  return (
    <div>
      <div style={s.toolbar}>
        <SeverityCounters
          counts={counts}
          active={severity}
          onSelect={setSeverity}
          onOpenDetails={setDetailsFor}
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

      {detailsFor && (
        <SeverityFindingsModal
          severity={detailsFor}
          findings={findings}
          agentName={agentName}
          onClose={closeDetails}
          onShowOnly={(sev) => {
            setSeverity(sev);
            setDetailsFor(null);
          }}
        />
      )}
    </div>
  );
}
