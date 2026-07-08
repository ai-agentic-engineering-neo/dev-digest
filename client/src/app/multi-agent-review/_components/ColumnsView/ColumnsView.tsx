/* ColumnsView — one column per agent (AC-12/13/15), built entirely from the
   T11 shared blocks (AgentSummary + FindingCard). Failed columns render
   their error via AgentSummary without blocking sibling columns (AC-15).
   Live status is resolved by the caller (page level) and passed in per
   run_id so toggling to/from TabsView never re-fetches (AC-16). */
"use client";

import { useTranslations } from "next-intl";
import type { FindingActionKind } from "@devdigest/shared";
import { AgentSummary, type LiveAgentStatus } from "../AgentSummary";
import { FindingCard } from "../FindingCard";
import type { EnrichedAgentColumn } from "../types";
import { s } from "./styles";

export function ColumnsView({
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

  // Up to 5 agents share the row evenly; beyond that the row scrolls
  // horizontally so columns never shrink below a readable width (design N4).
  const cols = Math.min(columns.length || 1, 5);
  const scroller = {
    ...s.scroller,
    gridTemplateColumns: `repeat(${cols}, minmax(260px, 1fr))`,
    ...(columns.length > 5 ? { overflowX: "auto" as const } : {}),
  };

  return (
    <div style={scroller}>
      {columns.map((col) => (
        <div key={col.run_id} style={s.column} data-agent-run-id={col.run_id}>
          <AgentSummary
            column={col}
            status={statuses[col.run_id] ?? col.status}
            onViewTrace={() => onViewTrace(col.run_id)}
          />
          <div style={s.findings}>
            {col.findings.length === 0 ? (
              <div style={s.emptyFindings}>{t("columns.noFindings")}</div>
            ) : (
              col.findings.map((f) => (
                <FindingCard
                  key={f.id}
                  f={f}
                  pending={pending}
                  onAction={(action) => onFindingAction(f.id, action)}
                />
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
