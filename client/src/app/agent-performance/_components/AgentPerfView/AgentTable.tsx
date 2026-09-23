"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Icon } from "@devdigest/ui";
import type { AgentPerfRow } from "@devdigest/shared/contracts/productionize";
import { formatCost, relativeTime } from "@/lib/format";
import { acceptRateWithDenominator, formatDuration, sortAgents } from "./helpers";
import type { SortDir, SortField } from "./constants";
import { s } from "./styles";

/**
 * AC-42 — one row per agent: runs, avg cost, avg duration, accept rate,
 * last run and an open affordance, sortable by accept rate / runs / cost
 * (D3 — `total_cost_usd` is now actually wired, not dead code). AC-46 — a
 * CI-only agent (accept_rate null, runs_ci > 0) shows the not-applicable
 * marker rather than 0%; not a color-only cue (AC-56) since the cell is
 * text, not a colored dot. Row-expand reveals accepted/dismissed/pending and
 * cost-by-source (AC-7's provenance split) without leaving the table.
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
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
            <span style={s.visuallyHidden}>Expand</span>
          </th>
          <th style={s.th} scope="col">
            {t("table.agent")}
          </th>
          {sortHeader("runs", t("table.runs"), t("sort.runs"))}
          {sortHeader("total_cost_usd", t("table.avgCost"), t("sort.cost"))}
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
        {rows.map((r) => {
          const isOpen = expanded.has(r.agent_id);
          return (
            <React.Fragment key={r.agent_id}>
              <tr>
                <td style={s.td}>
                  <button
                    type="button"
                    style={s.expandBtn}
                    onClick={() => toggle(r.agent_id)}
                    aria-expanded={isOpen}
                    aria-label={isOpen ? t("table.collapse", { name: r.agent_name }) : t("table.expand", { name: r.agent_name })}
                  >
                    <Icon.ChevronDown size={13} style={isOpen ? undefined : { transform: "rotate(-90deg)" }} />
                  </button>
                </td>
                <td style={s.td}>{r.agent_name}</td>
                <td style={s.td}>{r.runs}</td>
                <td style={s.td}>{formatCost(r.avg_cost_usd)}</td>
                <td style={s.td}>{formatDuration(r.avg_latency_ms)}</td>
                <td style={s.td}>
                  {acceptRateWithDenominator(r, na)}
                  {r.low_sample && <span style={s.lowSampleChip}>{t("table.lowSample")}</span>}
                </td>
                <td style={s.td}>{relativeTime(r.last_run_at)}</td>
                <td style={s.td}>
                  <Link href={`/agents/${r.agent_id}?tab=stats`}>{t("table.open")}</Link>
                </td>
              </tr>
              {isOpen && (
                <tr style={s.detailRow}>
                  <td style={s.detailCell} />
                  <td style={s.detailCell} colSpan={7}>
                    <div style={s.detailGrid}>
                      <span>
                        <span style={s.detailLabel}>{t("table.accepted")}</span>
                        {r.accepted}
                      </span>
                      <span>
                        <span style={s.detailLabel}>{t("table.dismissed")}</span>
                        {r.dismissed}
                      </span>
                      <span>
                        <span style={s.detailLabel}>{t("table.costBySource")}</span>
                        {t("cost.reconciled", { amount: formatCost(r.cost_by_source.provider) })} ·{" "}
                        {t("cost.estimated", { amount: formatCost(r.cost_by_source.estimated) })}
                        {r.cost_by_source.unknown != null && (
                          <> · {t("cost.unknown", { amount: formatCost(r.cost_by_source.unknown) })}</>
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
