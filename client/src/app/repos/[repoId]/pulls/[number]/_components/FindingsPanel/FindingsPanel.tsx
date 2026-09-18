/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SeverityFilterPills } from "./SeverityFilterPills";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { countBySeverity } from "../../../../../../../lib/findings";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

interface FindingsPanelProps {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Seed the severity filter from an incoming deep link / Timeline chip. It
   *  seeds the SAME `severityFilter` the pills already own — the pills' own
   *  rendering and click handler are untouched. */
  initialSeverity?: Severity | null;
  /** Bumped by the parent to re-apply `initialSeverity` even when it's the
   *  same value as last time (same re-trigger idiom as targetRunId/nonce). */
  focusNonce?: number;
  /** Fired on a USER change of the severity filter (pill click / Escape) —
   *  never on mount/remount — so the parent can mirror it into the URL. */
  onSeverityFilterChange?: (sev: Severity | null) => void;
}

/**
 * `focusNonce` is the parent's PER-RUN "last nonce this panel was told to
 * apply": it starts at 0, only moves forward, and only when this very run is
 * navigated to — so another run becoming the navigation target can never change
 * this panel's key. That is what keeps two open accordions independently
 * filterable in both directions.
 *
 * `hideLow` lives HERE, outside the keyed body, because the body is remounted
 * on every re-trigger: the user's own hide-low-confidence choice must survive
 * an incoming deep link, while the severity filter is exactly what that link
 * is meant to replace. Deliberately a keyed REMOUNT rather than a
 * "sync state from props" effect: an effect fires for whichever panel happens
 * to see the prop change, which is exactly how the cross-accordion filter reset
 * used to happen.
 */
export function FindingsPanel(props: FindingsPanelProps) {
  const [hideLow, setHideLow] = React.useState(false);
  return (
    <FindingsPanelBody
      key={`${props.initialSeverity ?? ""}-${props.focusNonce ?? 0}`}
      {...props}
      hideLow={hideLow}
      onHideLowChange={setHideLow}
    />
  );
}

function FindingsPanelBody({
  findings,
  prId,
  repoFullName,
  headSha,
  initialSeverity = null,
  onSeverityFilterChange,
  hideLow,
  onHideLowChange,
}: FindingsPanelProps & { hideLow: boolean; onHideLowChange: (v: boolean) => void }) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [severityFilter, setSeverityFilter] = React.useState<Severity | null>(initialSeverity);

  // Confidence-filtered set only (severity NOT applied yet) — this is what
  // the pill counts are grouped from, so a pill's number always equals how
  // many cards would show for that severity at the current hideLow setting.
  const afterConfidence = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => countBySeverity(afterConfidence), [afterConfidence]);
  const shown = React.useMemo(
    () => (severityFilter ? afterConfidence.filter((f) => f.severity === severityFilter) : afterConfidence),
    [afterConfidence, severityFilter],
  );

  // Same click-to-filter / click-again-to-clear semantics as before; the next
  // value is computed OUTSIDE the state updater so the URL-sync side effect
  // fires once (StrictMode double-invokes updaters).
  const toggleSeverity = React.useCallback(
    (sev: Severity) => {
      const next = severityFilter === sev ? null : sev;
      setSeverityFilter(next);
      onSeverityFilterChange?.(next);
    },
    [severityFilter, onSeverityFilterChange],
  );

  // A previously-focused index can point past the end once a severity filter
  // shrinks the visible list — reset focus rather than silently going stale.
  React.useEffect(() => {
    setFocusIdx(0);
  }, [severityFilter]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard); Escape
  // clears an active severity filter.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape" && severityFilter) {
        setSeverityFilter(null);
        onSeverityFilterChange?.(null);
      }
      else if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId, severityFilter, onSeverityFilterChange]);

  return (
    <div>
      <SeverityFilterPills counts={counts} active={severityFilter} onToggle={toggleSeverity} />

      <div style={s.toolbar}>
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={onHideLowChange} size={16} />
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
              /* Expand by SEVERITY, not position: the things that block a
                 merge are open on arrival; SUGGESTIONs stay collapsed. */
              defaultExpanded={f.severity === "CRITICAL" || f.severity === "WARNING"}
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
