"use client";

/**
 * specs/14-export-to-ci.md AC-40…AC-47 — the workspace-scoped Agent
 * Performance page (NOT repo-scoped, per `client/LEARNINGS.md:404-416`).
 * Unifies `agent_runs.source === 'local'` and `'ci'` into one aggregate
 * (the server's `GET /agents/performance`, `modules/ci/service.ts`).
 *
 * specs/16-agent-performance-dashboard.md — AC-42's accept-rate direction IS
 * now rendered: `AgentPerfRow.trend`/`*_delta` are populated server-side
 * (D1-D4 fixes, previous-period comparison), and the range picker supports
 * a custom `from`/`to` alongside the 1/7/30/90 presets (supersedes
 * specs/14-export-to-ci.md D12).
 *
 * plan step 8 (plan-verifier fix round) — the selected range is mirrored
 * into the URL query string (`useRouter`/`useSearchParams`, the same
 * read-on-mount + write-on-change pattern `PullsListView.tsx` established
 * for `?status`), so it is shareable and survives a reload. The avg
 * accept-rate summary tile uses `CircularScore` for its gauge ring, same as
 * `StatsTab.tsx`'s own accept-rate tile.
 */
import React from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { CircularScore, Donut, EmptyState, ErrorState, MetricCard, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { PerfRangePicker } from "@/components/perf-range-picker/PerfRangePicker";
import { useAgentPerformance, type PerfRangeValue } from "@/lib/hooks/agent-performance";
import { formatCost } from "@/lib/format";
import type { SortDir, SortField } from "./constants";
import { AgentTable } from "./AgentTable";
import {
  formatAcceptRate,
  parseRangeFromSearchParams,
  rangeToSearchParams,
  totalCostBySource,
  totalCostDelta,
  totalTrend,
} from "./helpers";
import { s } from "./styles";

const SEGMENT_COLORS = ["var(--accent)", "var(--ok)", "var(--warn, var(--warning))", "var(--crit)", "var(--info, var(--text-secondary))"];

export function AgentPerfView() {
  const t = useTranslations("agentPerformance");
  const tRange = useTranslations("agentPerformance.range");
  const router = useRouter();
  const searchParams = useSearchParams();
  // plan step 8 — read the initial selection from the URL (survives a
  // reload/shared link); `setRange` below keeps the URL in sync on every
  // change. Local `useState` (not a full `searchParams`-driven render) so a
  // selection re-renders immediately without depending on the App Router's
  // own re-render timing.
  const [range, setRangeState] = React.useState<PerfRangeValue>(() => parseRangeFromSearchParams(searchParams));
  const [sortField, setSortField] = React.useState<SortField>("accept_rate");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const setRange = (next: PerfRangeValue) => {
    setRangeState(next);
    router.replace(`/agent-performance?${rangeToSearchParams(next).toString()}`);
  };

  // AC-6 — only ever this ONE read hook; no run-trigger hook is imported
  // into this file, so reload/sort/range-switch can never trigger a review.
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
  const mostActiveRow =
    data && data.summary.most_active_agent
      ? data.agents.find((a) => a.agent_name === data.summary.most_active_agent)
      : undefined;
  const costDelta = data ? totalCostDelta(data.agents) : null;
  const costBySource = data ? totalCostBySource(data.agents) : { provider: null, estimated: null, unknown: null };
  const hasCostProvenance = costBySource.provider != null || costBySource.estimated != null || costBySource.unknown != null;

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <PerfRangePicker value={range} onChange={setRange} t={tRange} />
        </div>

        {/* D4 — reshaped to match the real layout: four tiles + a table +
            two donuts, not two bare 90px blocks. */}
        {isLoading && (
          <div style={s.section}>
            <div style={s.skeletonTiles}>
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
              <Skeleton height={90} />
            </div>
            <Skeleton height={260} />
            <div style={s.cards}>
              <Skeleton height={220} />
              <Skeleton height={220} />
            </div>
          </div>
        )}

        {!isLoading && noRuns && <EmptyState icon="Gauge" title={t("empty.title")} body={t("empty.body")} />}

        {!isLoading && data && !noRuns && (
          <>
            <div style={s.tiles}>
              <MetricCard
                label={t("summary.totalRuns")}
                value={data.summary.runs}
                trend={totalTrend(data.agents)}
              />
              <MetricCard
                label={t("summary.totalCost")}
                value={formatCost(data.summary.total_cost_usd)}
                delta={costDelta ?? undefined}
                deltaLabel={costDelta != null ? t("delta.vsPrevious") : undefined}
              />
              {/* Gap 2 (plan-verifier fix round) — the gauge ring, same
                  treatment as StatsTab.tsx's own accept-rate tile: no ring
                  drawn with nothing judged yet, "—" beats a fabricated 0%. */}
              <div style={s.acceptTile}>
                {data.summary.avg_accept_rate != null && (
                  <CircularScore score={Math.round(data.summary.avg_accept_rate * 100)} size={46} />
                )}
                <div style={s.acceptText}>
                  <div style={s.tileLabel}>{t("summary.avgAcceptRate")}</div>
                  <div className="tnum" style={s.tileValue}>
                    {data.summary.avg_accept_rate != null
                      ? `${Math.round(data.summary.avg_accept_rate * 100)}%`
                      : t("notApplicable")}
                  </div>
                </div>
              </div>
              <MetricCard
                label={t("summary.mostActive")}
                value={data.summary.most_active_agent ?? t("notApplicable")}
                suffix={
                  mostActiveRow
                    ? ` · ${mostActiveRow.runs} · ${formatAcceptRate(mostActiveRow.accept_rate, t("notApplicable"))}`
                    : undefined
                }
              />
            </div>

            {hasCostProvenance && (
              <p style={s.provenanceLine} title={t("cost.provenanceNote")}>
                {[
                  costBySource.provider != null ? t("cost.reconciled", { amount: formatCost(costBySource.provider) }) : null,
                  costBySource.estimated != null ? t("cost.estimated", { amount: formatCost(costBySource.estimated) }) : null,
                  costBySource.unknown != null ? t("cost.unknown", { amount: formatCost(costBySource.unknown) }) : null,
                ]
                  .filter((v): v is string => v != null)
                  .join(" · ")}
              </p>
            )}

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
