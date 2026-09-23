"use client";

/**
 * specs/16-agent-performance-dashboard.md — the per-agent Stats tab, built
 * from `GET /agents/:id/stats` (the SAME `performanceRows` query + `_shared/
 * perf.ts` rules the `/agent-performance` dashboard uses, scoped to this one
 * agent) — so AC-1's "matches the per-agent Stats view for the same agent
 * and period" is a real reconciliation, not aspirational. Shares the same
 * `PerfRangePicker` as the dashboard (plan step 9) so the comparison is
 * like-for-like.
 *
 * Null-is-not-zero (root CLAUDE.md, specs/01): loading shows no digits,
 * error shows no digits, and an agent with zero runs in the selected period
 * renders its OWN empty state rather than fabricated "$0.00"/"0%" tiles.
 */
import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore, EmptyState, ErrorState, MetricCard, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { PerfRangePicker } from "@/components/perf-range-picker/PerfRangePicker";
import { useAgentStats, type PerfRangeValue } from "@/lib/hooks/agent-performance";
import { formatCost } from "@/lib/format";
import { acceptRateWithDenominator, formatDuration } from "./helpers";
import { s } from "./styles";

const DEFAULT_RANGE: PerfRangeValue = { days: 30 };

export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents.stats");
  const tRange = useTranslations("agents.stats.range");
  const [range, setRange] = React.useState<PerfRangeValue>(DEFAULT_RANGE);
  // AC-6 — only ever this ONE read hook; no run-trigger hook is imported
  // into this file, so reload/sort/range-switch can never trigger a review.
  const { data, isLoading, isError, refetch } = useAgentStats(agent.id, range);
  const na = t("notApplicable");

  const hasCostProvenance =
    !!data &&
    (data.cost_by_source.provider != null || data.cost_by_source.estimated != null || data.cost_by_source.unknown != null);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <PerfRangePicker value={range} onChange={setRange} t={tRange} />
      </div>

      {isLoading && (
        <div style={s.tiles}>
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
          <Skeleton height={90} />
        </div>
      )}

      {isError && <ErrorState body={t("loadError")} onRetry={() => refetch()} />}

      {!isLoading && !isError && data && data.runs === 0 && (
        <EmptyState icon="Gauge" title={t("empty.title")} body={t("empty.body")} />
      )}

      {!isLoading && !isError && data && data.runs > 0 && (
        <>
          <div style={s.tiles}>
            <MetricCard
              label={t("runs")}
              value={data.runs}
              trend={data.trend.map((p) => p.value)}
              delta={data.runs_delta ?? undefined}
              deltaLabel={data.runs_delta != null ? t("delta.vsPrevious") : undefined}
            />
            <MetricCard
              label={t("totalCost")}
              value={formatCost(data.total_cost_usd)}
              delta={data.cost_delta ?? undefined}
              deltaLabel={data.cost_delta != null ? t("delta.vsPrevious") : undefined}
            />

            {/* ACCEPT RATE carries the ring gauge, same as SkillsTab's own —
                with nothing judged yet there is no score to draw, "—" beats
                a 0% ring. */}
            <div style={s.acceptTile}>
              {data.accept_rate != null && <CircularScore score={Math.round(data.accept_rate * 100)} size={46} />}
              <div style={s.acceptText}>
                <div style={s.tileLabel}>{t("acceptRate")}</div>
                <div className="tnum" style={s.tileValue}>
                  {acceptRateWithDenominator(data, na)}
                </div>
                {data.low_sample && <div style={s.lowSampleNote}>{t("lowSample")}</div>}
              </div>
            </div>

            <MetricCard label={t("avgDuration")} value={formatDuration(data.avg_latency_ms)} />
          </div>

          {hasCostProvenance && (
            <p style={s.provenanceLine}>
              {[
                data.cost_by_source.provider != null
                  ? t("cost.reconciled", { amount: formatCost(data.cost_by_source.provider) })
                  : null,
                data.cost_by_source.estimated != null
                  ? t("cost.estimated", { amount: formatCost(data.cost_by_source.estimated) })
                  : null,
                data.cost_by_source.unknown != null
                  ? t("cost.unknown", { amount: formatCost(data.cost_by_source.unknown) })
                  : null,
              ]
                .filter((v): v is string => v != null)
                .join(" · ")}
            </p>
          )}

          <div style={s.findingsRow}>
            <span style={s.findingsLabel}>{t("findingsTotal")}</span>
            <span className="tnum">{data.findings_total}</span>
            {data.pending > 0 && <span style={s.pendingNote}>{t("pending", { count: data.pending })}</span>}
          </div>
        </>
      )}
    </div>
  );
}
