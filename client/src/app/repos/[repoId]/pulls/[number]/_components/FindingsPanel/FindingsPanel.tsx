/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "../FindingCard/constants";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings, countBySeverity, bySeverity } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  targetFindingId = null,
  targetFindingNonce = 0,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Smart Diff → Findings navigation — when set, that finding's card gets
   *  keyboard focus, expands, and scrolls into view (ReviewRunAccordion's
   *  own open/scroll already got this panel on-screen). */
  targetFindingId?: string | null;
  targetFindingNonce?: number;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<string | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Counts come from the post-hide-low list, so a chip's number always equals
  // the number of cards you get when you click it.
  const visible = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => countBySeverity(visible), [visible]);
  const shown = React.useMemo(() => bySeverity(visible, severity), [visible, severity]);

  // A narrower list can't keep the old focus — it may now point past the end.
  React.useEffect(() => setFocusIdx(0), [severity, hideLow]);

  // Smart Diff navigation moves keyboard focus (j/k) to the target finding too,
  // so accept/dismiss shortcuts act on it right after the jump.
  React.useEffect(() => {
    if (!targetFindingId) return;
    const idx = shown.findIndex((f) => f.id === targetFindingId);
    if (idx >= 0) setFocusIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFindingId, targetFindingNonce]);

  const toggleSeverity = React.useCallback(
    (sev: string) => setSeverity((cur) => (cur === sev ? null : sev)),
    [],
  );

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
        {counts.map(({ severity: sev, count }) => {
          const active = severity === sev;
          const color = SEV_COLOR[sev] ?? SEV_COLOR_FALLBACK;
          return (
            <button
              key={sev}
              type="button"
              aria-pressed={active}
              title={active ? t("panel.clearFilter") : t("panel.filterBySeverity", { severity: sev })}
              onClick={() => toggleSeverity(sev)}
              style={s.severityChip(color, active)}
            >
              {count} {sev}
            </button>
          );
        })}
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
              targetFindingId={targetFindingId}
              targetFindingNonce={targetFindingNonce}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
