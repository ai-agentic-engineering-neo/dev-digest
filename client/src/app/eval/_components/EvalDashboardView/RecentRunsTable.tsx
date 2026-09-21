"use client";

import { useTranslations } from "next-intl";
import { EmptyState, Icon } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared/contracts/eval-ci";
import { formatCost, relativeTime } from "@/lib/format";
import { formatMetricPct } from "@/lib/eval-format";
import { s } from "./styles";

/** AC-41 — a combined recent-runs table naming each row's agent, time,
 *  metrics and cost, across every agent (not scoped to one). */
export function RecentRunsTable({ runs }: { runs: EvalRunRecord[] }) {
  const t = useTranslations("eval");
  const na = t("notApplicable");

  if (runs.length === 0) {
    return <EmptyState icon="History" title={t("dashboard.recentRuns")} body={t("dashboard.noRuns")} />;
  }

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th} scope="col">
            {t("dashboard.table.agent")}
          </th>
          <th style={s.th} scope="col">
            {t("dashboard.table.ranAt")}
          </th>
          <th style={s.th} scope="col">
            {t("dashboard.table.status")}
          </th>
          <th style={s.th} scope="col">
            {t("dashboard.table.recall")}
          </th>
          <th style={s.th} scope="col">
            {t("dashboard.table.precision")}
          </th>
          <th style={s.th} scope="col">
            {t("dashboard.table.citation")}
          </th>
          <th style={s.th} scope="col">
            {t("dashboard.table.cost")}
          </th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            <td style={s.td}>{r.agent_name ?? "—"}</td>
            <td style={s.td}>{relativeTime(r.started_at)}</td>
            <td style={s.td}>
              <StatusCell status={r.status} />
            </td>
            <td style={s.td}>{formatMetricPct(r.metrics?.recall, na)}</td>
            <td style={s.td}>{formatMetricPct(r.metrics?.precision, na)}</td>
            <td style={s.td}>{formatMetricPct(r.metrics?.citation_accuracy, na)}</td>
            <td style={s.td}>{formatCost(r.cost_usd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StatusCell({ status }: { status: EvalRunRecord["status"] }) {
  const t = useTranslations("eval");
  if (status === "running") {
    return (
      <span style={s.outcome("var(--text-secondary)")}>
        <Icon.RefreshCw size={12} />
        {t("status.running")}
      </span>
    );
  }
  if (status === "errored") {
    return (
      <span style={s.outcome("var(--warn)")}>
        <Icon.AlertTriangle size={12} />
        {t("status.errored")}
      </span>
    );
  }
  return (
    <span style={s.outcome("var(--ok, var(--text-secondary))")}>
      <Icon.CheckCircle size={12} />
      {t("status.completed")}
    </span>
  );
}
