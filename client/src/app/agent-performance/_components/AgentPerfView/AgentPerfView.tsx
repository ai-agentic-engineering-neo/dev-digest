"use client";

/**
 * specs/14-export-to-ci.md AC-40…AC-47 — the workspace-scoped Agent
 * Performance page (NOT repo-scoped, per `client/LEARNINGS.md:404-416`).
 * Unifies `agent_runs.source === 'local'` and `'ci'` into one aggregate
 * (the server's `GET /agents/performance`, `modules/ci/service.ts`).
 *
 * AC-42's "accept-rate direction" is NOT rendered: the already-committed
 * `AgentPerfRow` contract (`server/src/vendor/shared/contracts/
 * productionize.ts`) carries no direction/previous-period field — `trend`
 * exists but the server always returns it empty (`trend: []`,
 * `modules/ci/service.ts agentPerformance()`), so there is no data to derive
 * a direction arrow from. Flagged as a gap in Phase D's committed
 * aggregation, not something Phase E can add without a server-side change.
 */
import React from "react";
import { useTranslations } from "next-intl";
import { Donut, EmptyState, ErrorState, MetricCard, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgentPerformance } from "@/lib/hooks/agent-performance";
import { formatCost } from "@/lib/format";
import { DEFAULT_RANGE, RANGE_PRESETS, type RangeDays, type SortDir, type SortField } from "./constants";
import { AgentTable } from "./AgentTable";
import { s } from "./styles";

const SEGMENT_COLORS = ["var(--accent)", "var(--ok)", "var(--warn, var(--warning))", "var(--crit)", "var(--info, var(--text-secondary))"];

export function AgentPerfView() {
  const t = useTranslations("agentPerformance");
  const [range, setRange] = React.useState<RangeDays>(DEFAULT_RANGE);
  const [sortField, setSortField] = React.useState<SortField>("accept_rate");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const { data, isLoading, isError, refetch } = useAgentPerformance(range);

  const onSort = (field: SortField) => {
    if (field === sortField) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  if (isError) {
    return (
      <AppShell crumb={[{ label: t("title") }]}>
        <ErrorState fullScreen body={t("loadError")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  const noRuns = !isLoading && (!data || data.summary.runs === 0);
  const anyCiOnly = data?.agents.some((a) => a.accept_rate == null && a.runs_ci > 0) ?? false;

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <div style={s.rangeRow} role="radiogroup" aria-label={t("range.label")}>
            {RANGE_PRESETS.map((days) => (
              <button
                key={days}
                type="button"
                role="radio"
                aria-checked={range === days}
                onClick={() => setRange(days)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  border: "1px solid " + (range === days ? "var(--accent)" : "var(--border)"),
                  background: range === days ? "var(--accent-bg)" : "transparent",
                  color: range === days ? "var(--accent-text)" : "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                {t(`range.${days}`)}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (
          <div style={s.tiles}>
            <Skeleton height={90} />
            <Skeleton height={90} />
          </div>
        )}

        {!isLoading && noRuns && <EmptyState icon="Gauge" title={t("empty.title")} body={t("empty.body")} />}

        {!isLoading && data && !noRuns && (
          <>
            <div style={s.tiles}>
              <MetricCard label={t("summary.totalRuns")} value={data.summary.runs} />
              <MetricCard label={t("summary.totalCost")} value={formatCost(data.summary.total_cost_usd)} />
              <MetricCard
                label={t("summary.avgAcceptRate")}
                value={data.summary.avg_accept_rate != null ? `${Math.round(data.summary.avg_accept_rate * 100)}%` : t("notApplicable")}
              />
              <MetricCard
                label={t("summary.mostActive")}
                value={data.summary.most_active_agent ?? t("notApplicable")}
                suffix={
                  data.summary.most_active_agent
                    ? ` · ${data.agents.find((a) => a.agent_name === data.summary.most_active_agent)?.runs ?? 0}`
                    : undefined
                }
              />
            </div>

            {anyCiOnly && <p style={s.note}>{t("ciOnlyNote")}</p>}

            <div style={s.section}>
              <h2 style={s.h2}>{t("perAgent")}</h2>
              <AgentTable agents={data.agents} sortField={sortField} sortDir={sortDir} onSort={onSort} />
            </div>

            <div style={s.cards}>
              <div style={s.card}>
                <h2 style={s.h2}>{t("costByAgent")}</h2>
                {data.cost_by_agent.length === 0 ? (
                  <p style={s.note}>{t("noCost")}</p>
                ) : (
                  <Donut segments={data.cost_by_agent.map((seg, i) => ({ ...seg, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]! }))} />
                )}
              </div>
              <div style={s.card}>
                <h2 style={s.h2}>{t("costByModel")}</h2>
                {data.cost_by_model.length === 0 ? (
                  <p style={s.note}>{t("noCost")}</p>
                ) : (
                  <Donut segments={data.cost_by_model.map((seg, i) => ({ ...seg, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length]! }))} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
