/* TabsView — one agent's result at a time (own tablist: the kit Tabs label is string-only). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, Skeleton } from "@devdigest/ui";
import { FindingCard } from "@/components/finding-card";
import { AgentBadge, agentColorVar } from "@/components/agent-badge";
import { RunCostBadge } from "@/components/run-cost-badge";
import { useFindingAction } from "@/lib/hooks/reviews";
import { formatSeconds, scoreTone, visibleFindings } from "../../../../helpers";
import type { AgentColumnView } from "../../../../types";
import { s } from "./styles";

export interface TabsViewProps {
  prId: string;
  columns: readonly AgentColumnView[];
  onlyFindingIds: ReadonlySet<string> | null;
  onViewTrace: (runId: string) => void;
  onRetry: (agentId: string) => void;
}

function columnScore(column: AgentColumnView): number | null {
  return column.state.kind === "done" ? (column.state.review.score ?? column.state.run.score) : null;
}

function TabPanel({
  prId,
  column,
  onlyFindingIds,
  onViewTrace,
  onRetry,
}: Omit<TabsViewProps, "columns"> & { column: AgentColumnView }) {
  const t = useTranslations("runs");
  const action = useFindingAction();
  const { state, agent } = column;

  if (state.kind === "starting") {
    return (
      <div style={s.message}>
        <Skeleton height={14} />
        <p>{t("column.starting")}</p>
      </div>
    );
  }
  if (state.kind === "running") return <p style={s.message}>{t("column.running")}</p>;
  if (state.kind === "failed_to_start") {
    return (
      <div style={s.message}>
        <p>{t("column.failedToStart")}</p>
        <p style={s.error}>{state.error ?? t("column.noRunStarted")}</p>
        <Button onClick={() => onRetry(agent.id)}>{t("column.retry")}</Button>
      </div>
    );
  }
  if (state.kind !== "done") {
    return (
      <div style={s.message}>
        <p>{state.kind === "failed" ? t("column.failed") : t("column.cancelled")}</p>
        {state.run.error && <p style={s.error}>{state.run.error}</p>}
        <Button onClick={() => onViewTrace(state.run.run_id)}>{t("viewTrace")}</Button>
      </div>
    );
  }

  const { run, review } = state;
  const score = columnScore(column);
  const findings = visibleFindings(column, onlyFindingIds);
  return (
    <div style={s.panel}>
      <div style={s.summaryCard}>
        {score != null && <CircularScore score={score} size={52} stroke={5} />}
        <div style={s.summaryMain}>
          <span style={s.name}>{agent.name}</span>
          <span style={s.summaryText}>{review.summary ?? t("tabs.noSummary")}</span>
        </div>
        <div style={s.meta}>
          {run.duration_ms != null && <span>{t("column.duration", { seconds: formatSeconds(run.duration_ms) })}</span>}
          <RunCostBadge variant="compact" costUsd={run.cost_usd} />
          <Button onClick={() => onViewTrace(run.run_id)}>{t("viewTrace")}</Button>
        </div>
      </div>
      {findings.length === 0 ? (
        <p style={s.message}>{t("column.noFindings")}</p>
      ) : (
        <div style={s.findings}>
          {findings.map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              onAction={(a, reply) => action.mutate({ findingId: f.id, action: a, reply, prId })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TabsView({ prId, columns, onlyFindingIds, onViewTrace, onRetry }: TabsViewProps) {
  const t = useTranslations("runs");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const active = columns.find((c) => c.agent.id === selectedId) ?? columns[0];
  if (!active) return null;

  return (
    <div style={s.root}>
      <div role="tablist" aria-label={t("tabs.label")} style={s.tablist}>
        {columns.map((c) => {
          const isActive = c.agent.id === active.agent.id;
          const score = columnScore(c);
          return (
            <button
              key={c.agent.id}
              type="button"
              role="tab"
              id={`agent-tab-${c.agent.id}`}
              aria-selected={isActive}
              aria-controls={`agent-panel-${c.agent.id}`}
              style={s.tab(isActive, agentColorVar(c.agent.colorIndex))}
              onClick={() => setSelectedId(c.agent.id)}
            >
              <AgentBadge colorIndex={c.agent.colorIndex} size={20} />
              <span>{c.agent.name}</span>
              {score != null && <span style={s.tabScore(`var(--${scoreTone(score)})`)}>{score}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`agent-panel-${active.agent.id}`} aria-labelledby={`agent-tab-${active.agent.id}`}>
        <TabPanel
          prId={prId}
          column={active}
          onlyFindingIds={onlyFindingIds}
          onViewTrace={onViewTrace}
          onRetry={onRetry}
        />
      </div>
    </div>
  );
}

export default TabsView;
