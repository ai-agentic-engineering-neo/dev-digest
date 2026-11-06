"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import RunTraceDrawer from "@/components/run-trace-drawer";
import type { MultiAgentViewMode } from "@/lib/multi-agent-url";
import { countedColumns, conflictFindingIds, findConflicts } from "../../conflicts";
import { runTotals, visibleFindings } from "../../helpers";
import type { ResolvedPr, SelectedAgent, StartStates } from "../../types";
import { useResultsData } from "./hooks/useResultsData";
import { AgentColumnCard } from "./_components/AgentColumnCard";
import { ConflictsSection } from "./_components/ConflictsSection";
import { TabsView } from "./_components/TabsView";
import { ResultsHeader } from "./_components/ResultsHeader";
import { s } from "./styles";

export interface MultiAgentResultsProps {
  pr: ResolvedPr;
  agents: readonly SelectedAgent[];
  view: MultiAgentViewMode;
  startStates: StartStates;
  onRetry: (agentId: string) => void;
  onConfigure: () => void;
  onChangeView: (view: MultiAgentViewMode) => void;
}

export function MultiAgentResults({
  pr,
  agents,
  view,
  startStates,
  onRetry,
  onConfigure,
  onChangeView,
}: MultiAgentResultsProps) {
  const t = useTranslations("runs");
  const { columns, isLoading, isError, refetch, hasAnyRun } = useResultsData(pr.id, agents, startStates);
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);

  if (isLoading) return <Skeleton height={160} />;

  if (isError) {
    return <ErrorState title={t("page.loadError.title")} body={t("page.loadError.body")} onRetry={refetch} />;
  }

  if (!hasAnyRun) {
    return (
      <EmptyState
        icon="Cpu"
        title={t("page.noRun.title")}
        body={t("page.noRun.body")}
        cta={t("page.noRun.cta")}
        onCta={onConfigure}
      />
    );
  }

  const conflicts = findConflicts(columns);
  const ids = conflictFindingIds(columns);
  const countedCount = countedColumns(columns).length;
  const onlyFindingIds = onlyConflicts ? ids : null;
  const traceColumn = traceRunId
    ? columns.find((c) => "run" in c.state && c.state.run.run_id === traceRunId)
    : undefined;

  return (
    <div style={s.root}>
      <ResultsHeader
        pr={pr}
        totals={runTotals(columns)}
        view={view}
        onChangeView={onChangeView}
        onConfigure={onConfigure}
      />

      {view === "tabs" ? (
        <TabsView
          prId={pr.id}
          columns={columns}
          onlyFindingIds={onlyFindingIds}
          onViewTrace={setTraceRunId}
          onRetry={onRetry}
        />
      ) : (
        <div role="list" style={s.grid(columns.length)}>
          {columns.map((column) => (
            <AgentColumnCard
              key={column.agent.id}
              column={column}
              visibleFindings={visibleFindings(column, onlyFindingIds)}
              filtered={onlyConflicts}
              onViewTrace={setTraceRunId}
              onRetry={onRetry}
            />
          ))}
        </div>
      )}

      <ConflictsSection
        conflicts={conflicts}
        agents={agents}
        countedCount={countedCount}
        onlyConflicts={onlyConflicts}
        onToggleOnlyConflicts={setOnlyConflicts}
      />

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          agentName={traceColumn?.agent.name}
          prNumber={pr.number}
          findings={traceColumn?.findings}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </div>
  );
}
