/* TabsView — one tab per agent with a score badge + the shared AgentSummary
   card and finding list (AC-16), built from the same T11 blocks as
   ColumnsView. Selecting a tab is local UI state only — it never re-fetches
   or re-runs anything (AC-16). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, type TabDef } from "@devdigest/ui";
import type { FindingActionKind } from "@devdigest/shared";
import { AgentSummary, type LiveAgentStatus } from "../AgentSummary";
import { FindingCard } from "../FindingCard";
import type { EnrichedAgentColumn } from "../types";
import { s } from "./styles";

export function TabsView({
  columns,
  statuses,
  pending,
  onFindingAction,
  onViewTrace,
}: {
  columns: EnrichedAgentColumn[];
  statuses: Record<string, LiveAgentStatus>;
  pending?: boolean;
  onFindingAction: (findingId: string, action: Extract<FindingActionKind, "accept" | "dismiss">) => void;
  onViewTrace: (runId: string) => void;
}) {
  const t = useTranslations("multiAgentReview");
  const [active, setActive] = React.useState<string | undefined>(columns[0]?.run_id);

  // Keep a valid selection if the column set changes (e.g. first load).
  React.useEffect(() => {
    if (!active && columns[0]) setActive(columns[0].run_id);
  }, [active, columns]);

  const tabs: TabDef[] = columns.map((col) => ({
    key: col.run_id,
    label: col.agent_name,
    count: col.score ?? undefined,
  }));

  const current = columns.find((c) => c.run_id === active) ?? columns[0];

  return (
    <div style={s.wrap}>
      <Tabs tabs={tabs} value={active ?? ""} onChange={setActive} pad="0" />
      {current && (
        <div style={s.tabPanel}>
          <AgentSummary
            column={current}
            status={statuses[current.run_id] ?? current.status}
            onViewTrace={() => onViewTrace(current.run_id)}
          />
          <div style={s.findings}>
            {current.findings.length === 0 ? (
              <div style={s.emptyFindings}>{t("tabs.noFindings")}</div>
            ) : (
              current.findings.map((f, i) => (
                <FindingCard
                  key={f.id}
                  f={f}
                  defaultExpanded={i === 0}
                  pending={pending}
                  onAction={(action) => onFindingAction(f.id, action)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
