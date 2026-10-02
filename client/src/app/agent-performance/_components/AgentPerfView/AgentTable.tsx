"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Icon } from "@devdigest/ui";
import type { AgentPerfRow } from "@devdigest/shared/contracts/productionize";
import { formatCost, relativeTime } from "@/lib/format";
import { formatAcceptRate, formatDuration, sortAgents } from "./helpers";
import type { SortDir, SortField } from "./constants";
import { s } from "./styles";

/**
 * AC-42 — one row per agent: runs, avg cost, avg duration, accept rate,
 * last run and an open affordance, sortable by accept rate (also runs/cost).
 * AC-46 — a CI-only agent (accept_rate null, runs_ci > 0) shows the
 * not-applicable marker rather than 0%; not a color-only cue (AC-56) since
 * the cell is text, not a colored dot.
 */
export function AgentTable({
  agents,
  sortField,
  sortDir,
  onSort,
}: {
  agents: AgentPerfRow[];
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const t = useTranslations("agentPerformance");
  const na = t("notApplicable");
  const rows = sortAgents(agents, sortField, sortDir);

  const sortHeader = (field: SortField, label: string, ariaLabel: string) => (
    <th style={s.th} scope="col">
      <button type="button" style={s.thSortBtn} onClick={() => onSort(field)} aria-label={ariaLabel}>
        {label}
        {sortField === field && <Icon.ChevronDown size={11} style={sortDir === "asc" ? { transform: "rotate(180deg)" } : undefined} />}
      </button>
    </th>
  );

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th} scope="col">
            {t("table.agent")}
          </th>
          {sortHeader("runs", t("table.runs"), t("sort.runs"))}
          <th style={s.th} scope="col">
            {t("table.avgCost")}
          </th>
          <th style={s.th} scope="col">
            {t("table.avgDuration")}
          </th>
          {sortHeader("accept_rate", t("table.accept"), t("sort.acceptRate"))}
          <th style={s.th} scope="col">
            {t("table.lastRun")}
          </th>
          <th style={s.th} scope="col">
            {t("table.open")}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.agent_id}>
            <td style={s.td}>{r.agent_name}</td>
            <td style={s.td}>{r.runs}</td>
            <td style={s.td}>{formatCost(r.avg_cost_usd)}</td>
            <td style={s.td}>{formatDuration(r.avg_latency_ms)}</td>
            <td style={s.td}>{formatAcceptRate(r.accept_rate, na)}</td>
            <td style={s.td}>{relativeTime(r.last_run_at)}</td>
            <td style={s.td}>
              <Link href={`/agents/${r.agent_id}?tab=ci`}>{t("table.open")}</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
