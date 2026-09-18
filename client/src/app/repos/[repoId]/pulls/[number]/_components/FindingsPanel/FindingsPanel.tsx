/* FindingsPanel — severity counters + hide-low-confidence + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, SeverityBadge, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION, SEVERITY_ORDER } from "./constants";
import { severityCounts, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  severityFilter: controlledFilter,
  onSeverityFilterChange,
  hideSeverityCounters = false,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Controlled severity filter — when provided (including `null`), the
   *  panel's own toolbar counters stop managing filter state themselves and
   *  defer to this value + `onSeverityFilterChange` instead. Used when a
   *  caller renders its own severity pills elsewhere (e.g. under
   *  VerdictBanner) and needs them to drive the same list. */
  severityFilter?: string | null;
  onSeverityFilterChange?: (severity: string | null) => void;
  /** Hide the toolbar's own severity counters — pair with a controlled
   *  `severityFilter` when the caller renders an equivalent pill row itself. */
  hideSeverityCounters?: boolean;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  // Deep link: /pulls/N?tab=findings&severity=CRITICAL pre-applies the filter
  // (the PR list's findings chips navigate here). Unknown values are ignored.
  const urlSeverity = useSearchParams().get("severity");
  const [hideLow, setHideLow] = React.useState(false);
  const [localFilter, setLocalFilter] = React.useState<string | null>(
    urlSeverity && urlSeverity in SEVERITY_ORDER ? urlSeverity : null,
  );
  const isControlled = controlledFilter !== undefined;
  const severityFilter = isControlled ? controlledFilter : localFilter;
  const [focusIdx, setFocusIdx] = React.useState(0);

  const counts = React.useMemo(() => severityCounts(findings), [findings]);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severityFilter),
    [findings, hideLow, severityFilter],
  );

  // Click a counter to keep only that severity; click it again to show all.
  const toggleSeverity = (sev: string) => {
    const next = severityFilter === sev ? null : sev;
    if (isControlled) onSeverityFilterChange?.(next);
    else setLocalFilter(next);
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
        {counts.length > 0 && !hideSeverityCounters && (
          <div style={s.counterGroup} role="group" aria-label={t("panel.severityCounters")}>
            {counts.map(([sev, count]) => (
              <button
                key={sev}
                type="button"
                aria-pressed={severityFilter === sev}
                title={
                  severityFilter === sev
                    ? t("panel.showAllSeverities")
                    : t("panel.showOnlySeverity", { severity: sev })
                }
                onClick={() => toggleSeverity(sev)}
                style={{
                  ...s.counterButton,
                  ...(severityFilter === sev ? s.counterButtonActive : {}),
                  ...(severityFilter && severityFilter !== sev ? s.counterButtonMuted : {}),
                }}
              >
                <SeverityBadge severity={sev as Severity} count={count} />
              </button>
            ))}
          </div>
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
