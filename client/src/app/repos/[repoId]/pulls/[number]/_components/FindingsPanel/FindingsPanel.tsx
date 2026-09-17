/* FindingsPanel — severity-filter pills + hide-low-confidence + j/k navigation
   + FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { SEVERITY_KEYS, countBySeverity } from "../../../../../../../lib/severity";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

/**
 * One severity pill in the «N CRITICAL · N WARNING · N SUGGESTION» row.
 * Single-select toggle: click to show only that severity, click again to clear.
 */
function SeverityPill({
  severity,
  count,
  active,
  onClick,
}: {
  severity: Severity;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const t = useTranslations("prReview");
  const meta = SEV[severity];
  const I = Icon[meta.icon];
  const [h, setH] = React.useState(false);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      title={t("panel.severityFilterAria", { severity: meta.label })}
      style={s.sevPill(active, h)}
    >
      <I size={12.5} style={{ color: meta.c }} />
      <span>{meta.label}</span>
      <span className="tnum" style={s.sevPillCount}>
        {count}
      </span>
    </button>
  );
}

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
  const [sev, setSev] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Pill counts group the confidence-filtered set, so a pill's number always
  // equals the finding cards of that severity rendered below it. Plain
  // client-side COUNT — no extra fetches.
  const base = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const shown = React.useMemo(
    () => (sev ? base.filter((f) => f.severity === sev) : base),
    [base, sev],
  );
  const counts = React.useMemo(() => countBySeverity(base), [base]);

  // Keep keyboard focus on a real row when the list shrinks (severity filter
  // or the hide-low toggle).
  React.useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(shown.length - 1, 0)));
  }, [shown.length]);

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

  // Only severities that actually exist get a pill.
  const pillKeys = SEVERITY_KEYS.filter((k) => counts[k] > 0);

  return (
    <div>
      <div style={s.toolbar}>
        {pillKeys.length > 0 && (
          <div role="group" aria-label={t("panel.severityFilterGroup")} style={s.pillRow}>
            {pillKeys.map((k, i) => (
              <React.Fragment key={k}>
                {i > 0 && (
                  <span aria-hidden style={s.pillSep}>
                    ·
                  </span>
                )}
                <SeverityPill
                  severity={k}
                  count={counts[k]}
                  active={sev === k}
                  onClick={() => setSev((cur) => (cur === k ? null : k))}
                />
              </React.Fragment>
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
