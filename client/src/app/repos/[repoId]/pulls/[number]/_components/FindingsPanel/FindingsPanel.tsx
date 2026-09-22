/* FindingsPanel — severity counters + severity filter + hide-low-confidence +
   j/k navigation + FindingCard list, wiring the accept/dismiss action hook (A2).
   Counting/filtering is a pure pass over the run's findings (no request). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, SEV } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { KEY_TO_ACTION, SEVERITY_LEVELS } from "./constants";
import { filterBySeverity, isEditableTarget, severityCounts, visibleFindings } from "./helpers";
import { SeverityCounts } from "./SeverityCounts";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  active = true,
  onActivate,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** Only the active panel handles j/k/a/d — several panels can be open at once. */
  active?: boolean;
  /** Called when the user interacts with this panel, so the parent can make it active. */
  onActivate?: () => void;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction(prId);
  const { mutate } = action;
  const [hideLow, setHideLow] = React.useState(false);
  const [sevFilter, setSevFilter] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Counts come from the confidence-filtered list, before the severity filter,
  // so a pill always equals the cards shown when that level is selected.
  const visible = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const counts = React.useMemo(() => severityCounts(visible), [visible]);
  const shown = React.useMemo(() => filterBySeverity(visible, sevFilter), [visible, sevFilter]);

  const toggleSeverity = (severity: Severity) => {
    setSevFilter((cur) => (cur === severity ? null : severity));
    setFocusIdx(0);
  };

  // Clamp during render: the filtered list can shrink below the focused index.
  const lastIdx = Math.max(shown.length - 1, 0);
  const focused = Math.min(focusIdx, lastIdx);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard), active panel only.
  React.useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isEditableTarget(e.target)) return;
      if (e.key === "j") setFocusIdx(Math.min(focused + 1, lastIdx));
      else if (e.key === "k") setFocusIdx(Math.max(focused - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focused]) {
        mutate({ findingId: shown[focused]!.id, action: KEY_TO_ACTION[e.key]! });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, shown, focused, lastIdx, mutate]);

  return (
    <div onPointerDownCapture={active ? undefined : onActivate} onFocusCapture={active ? undefined : onActivate}>
      <SeverityCounts counts={counts} active={sevFilter} onToggle={toggleSeverity} />
      <div style={s.toolbar}>
        <span style={s.filterLabel}>{t("panel.filterBy")}</span>
        {SEVERITY_LEVELS.map((sv) => (
          <Chip
            key={sv}
            active={sevFilter === sv}
            onClick={() => toggleSeverity(sv)}
            icon={SEV[sv].icon}
            color={SEV[sv].c}
          >
            {SEV[sv].label}
          </Chip>
        ))}
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
              focused={active && i === focused}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => mutate({ findingId: f.id, action: act })}
            />
          ))
        )}
      </div>
    </div>
  );
}
