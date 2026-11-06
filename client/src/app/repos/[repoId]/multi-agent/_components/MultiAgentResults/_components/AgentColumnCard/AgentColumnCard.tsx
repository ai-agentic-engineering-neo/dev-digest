"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import { Button, CircularScore, Skeleton } from "@devdigest/ui";
import { AgentBadge, agentColorVar } from "@/components/agent-badge";
import { RunCostBadge } from "@/components/run-cost-badge";
import type { AgentColumnView } from "../../../../types";
import { formatSeconds } from "../../../../helpers";
import { FindingRow } from "./_components/FindingRow";
import { s } from "./styles";

export interface AgentColumnCardProps {
  column: AgentColumnView;
  visibleFindings: FindingRecord[];
  filtered: boolean;
  onViewTrace: (runId: string) => void;
  onRetry: (agentId: string) => void;
}

export function AgentColumnCard({ column, visibleFindings, filtered, onViewTrace, onRetry }: AgentColumnCardProps) {
  const t = useTranslations("runs");
  const { agent, state } = column;
  const run = "run" in state ? state.run : null;
  const traceRunId =
    state.kind === "done" || state.kind === "failed" || state.kind === "cancelled" ? state.run.run_id : null;

  return (
    <div role="listitem" style={s.root(agentColorVar(agent.colorIndex))}>
      <div style={s.header}>
        <AgentBadge colorIndex={agent.colorIndex} />
        <div style={s.headerText}>
          <span style={s.name}>{agent.name}</span>
          {run && run.duration_ms != null && (
            <span style={s.meta}>
              {t("column.duration", { seconds: formatSeconds(run.duration_ms) })}
              <RunCostBadge variant="compact" costUsd={run.cost_usd} />
            </span>
          )}
        </div>
        {state.kind === "done" && state.review.score != null && <CircularScore score={state.review.score} size={40} />}
      </div>

      <div style={s.body}>
        {state.kind === "starting" && (
          <>
            <Skeleton height={12} />
            <Skeleton width="70%" height={12} />
            <span style={s.muted}>{t("column.starting")}</span>
          </>
        )}
        {state.kind === "running" && (
          <span style={s.muted} role="status">
            {t("column.running")}
          </span>
        )}
        {state.kind === "done" &&
          (visibleFindings.length > 0 ? (
            <ul style={s.list}>
              {visibleFindings.map((f) => (
                <FindingRow key={f.id} finding={f} />
              ))}
            </ul>
          ) : (
            <span style={s.muted}>{t("column.noFindings")}</span>
          ))}
        {(state.kind === "failed" || state.kind === "cancelled") && (
          <>
            <span style={s.statusLabel}>{t(state.kind === "failed" ? "column.failed" : "column.cancelled")}</span>
            {state.run.error && <span style={s.error}>{state.run.error}</span>}
          </>
        )}
        {state.kind === "failed_to_start" && (
          <>
            <span style={s.statusLabel}>{t("column.failedToStart")}</span>
            <span style={s.error}>{state.error ?? t("column.noRunStarted")}</span>
            <Button kind="secondary" size="sm" onClick={() => onRetry(agent.id)}>
              {t("column.retry")}
            </Button>
          </>
        )}
      </div>

      {state.kind === "done" && (
        <div style={s.footer}>
          <span>
            {filtered
              ? t("column.filteredCount", { shown: visibleFindings.length, total: column.findings.length })
              : t("column.findingsCount", { count: column.findings.length })}
          </span>
        </div>
      )}
      {traceRunId && (
        <Button kind="ghost" size="sm" onClick={() => onViewTrace(traceRunId)}>
          {t("viewTrace")}
        </Button>
      )}
    </div>
  );
}

export default AgentColumnCard;
