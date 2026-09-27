/* FindingsPanel — severity counters + filter, hide-low-confidence, j/k
   navigation and the FindingCard list, wiring the accept/dismiss action hook
   (A2).

   The severity pills are the run's own findings grouped by `severity` — a
   `COUNT`, no request and no model call. Clicking one narrows the list below;
   clicking it again clears the filter. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Icon, SEV, type Severity as SeverityToken } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { countBySeverity } from "@/components/findings-summary";
import { useFindingAction } from "@/lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { confidentFindings, visibleFindings } from "./helpers";
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

  // Counted on the confidence-gated set — the same set the filter narrows — so
  // a pill's number is always the number of cards below it.
  const counts = React.useMemo(
    () => countBySeverity(confidentFindings(findings, hideLow)),
    [findings, hideLow],
  );
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );

  // A filter change re-indexes the list, so j/k focus goes back to the top.
  const pickSeverity = (next: Severity) => {
    setSeverity((cur) => (cur === next ? null : next));
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

  return (
    <div>
      <div style={s.toolbar}>
        {counts.length > 0 && (
          <>
            <div style={s.pillRow}>
              {counts.map(({ severity: sev, count }) => {
                const tok = SEV[sev as SeverityToken];
                const SevIcon = Icon[tok.icon];
                const active = severity === sev;
                const label = t("findingsSummary.countLabel", {
                  count,
                  severity: t(`findingsSummary.severity.${sev}`),
                });
                return (
                  <button
                    key={sev}
                    type="button"
                    aria-pressed={active}
                    title={t(
                      active
                        ? "findingsSummary.clearSeverityFilter"
                        : "findingsSummary.filterBySeverity",
                      { severity: t(`findingsSummary.severity.${sev}`) },
                    )}
                    onClick={() => pickSeverity(sev)}
                    style={s.pill(tok.c, tok.bg, active)}
                  >
                    <SevIcon size={12.5} />
                    <span className="tnum">{label}</span>
                  </button>
                );
              })}
            </div>
            <span style={s.divider} />
          </>
        )}
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
