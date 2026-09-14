"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Sparkline } from "@devdigest/ui";
import type { EvalAgentSummary } from "@devdigest/shared/contracts/eval-ci";
import { formatMetricPct } from "@/lib/eval-format";
import { s } from "./styles";

/**
 * AC-40 — one row per agent that has eval cases: name, latest metrics and a
 * trend. AC-55: the sparkline trend is accompanied by a visually-hidden
 * table of the same recall values, so the trend has a non-graphical
 * equivalent.
 */
export function AgentSummaryRow({ agent }: { agent: EvalAgentSummary }) {
  const t = useTranslations("eval");
  const router = useRouter();
  const na = t("notApplicable");
  const open = () => router.push(`/eval/agents/${agent.agent_id}`);
  const recallTrend = agent.trend.map((p) => p.recall ?? 0);

  return (
    <div style={s.agentRow}>
      <div style={s.agentMain}>
        <button
          type="button"
          style={s.agentName}
          onClick={open}
          aria-label={t("dashboard.openAgent", { agent: agent.agent_name })}
        >
          {agent.agent_name}
        </button>
        <span style={s.agentMeta}>
          {t("dashboard.casesSummary", {
            count: agent.cases_total,
            runs: agent.trend.length,
          })}
        </span>
      </div>
      <div style={s.agentMetrics}>
        <div style={s.metricCol}>
          <span style={s.metricLabel}>{t("dashboard.metrics.recall")}</span>
          <span style={s.metricVal}>{formatMetricPct(agent.latest?.metrics?.recall, na)}</span>
        </div>
        <div style={s.metricCol}>
          <span style={s.metricLabel}>{t("dashboard.metrics.precision")}</span>
          <span style={s.metricVal}>{formatMetricPct(agent.latest?.metrics?.precision, na)}</span>
        </div>
        <div style={s.metricCol}>
          <span style={s.metricLabel}>{t("dashboard.metrics.citationAccuracy")}</span>
          <span style={s.metricVal}>{formatMetricPct(agent.latest?.metrics?.citation_accuracy, na)}</span>
        </div>
        <div style={s.metricCol}>
          <span style={s.metricLabel}>{t("evalsTab.casesPassed")}</span>
          <span style={s.metricVal}>
            {agent.latest?.metrics
              ? `${agent.latest.metrics.traces_passed}/${agent.latest.metrics.traces_total}`
              : na}
          </span>
        </div>
      </div>
      {agent.trend.length > 1 && (
        <>
          <Sparkline data={recallTrend} />
          <table style={s.visuallyHidden}>
            <caption>{t("dashboard.trendTableCaption", { agent: agent.agent_name })}</caption>
            <thead>
              <tr>
                <th scope="col">{t("dashboard.table.ranAt")}</th>
                <th scope="col">{t("dashboard.metrics.recall")}</th>
              </tr>
            </thead>
            <tbody>
              {agent.trend.map((p) => (
                <tr key={p.run_id}>
                  <td>{p.ran_at}</td>
                  <td>{formatMetricPct(p.recall, na)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
