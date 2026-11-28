/* FindingsPanel — severity filter + hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingActionKind, FindingRecord, Severity } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { SeverityFilter } from "../SeverityFilter";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { confidentFindings, countBySeverity, visibleFindings } from "./helpers";
import { s } from "./styles";
import { useFindingShortcuts } from "./useFindingShortcuts";

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

  // Counted after the confidence filter and before the severity filter, so a
  // counter always equals the number of cards a click on it will show.
  const counts = React.useMemo(
    () => countBySeverity(confidentFindings(findings, hideLow)),
    [findings, hideLow],
  );
  const shown = React.useMemo(
    () => visibleFindings(findings, { hideLow, severity }),
    [findings, hideLow, severity],
  );

  // A changed filter changes the list, so keyboard focus returns to its first card.
  const changeSeverity = (next: Severity | null) => {
    setSeverity(next);
    setFocusIdx(0);
  };
  const changeHideLow = (next: boolean) => {
    setHideLow(next);
    setFocusIdx(0);
  };

  const { mutate } = action;
  const act = React.useCallback(
    (findingId: string, kind: FindingActionKind) => mutate({ findingId, action: kind, prId }),
    [mutate, prId],
  );
  const shortcutProps = useFindingShortcuts({
    shown,
    focusIdx,
    setFocusIdx,
    pending: action.isPending,
    act,
  });

  return (
    <div {...shortcutProps}>
      <div style={s.toolbar}>
        <SeverityFilter counts={counts} active={severity} onChange={changeSeverity} />
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={changeHideLow} size={16} />
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
              onAction={(kind) => act(f.id, kind)}
            />
          ))
        )}
      </div>
    </div>
  );
}
