"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared/contracts/eval-ci";
import { formatCost, relativeTime } from "@/lib/format";
import { formatMetricPct } from "@/lib/eval-format";
import { s } from "./styles";

const MAX_COMPARE_SELECTION = 2;

/** AC-44 — the run-history table with two-run selection (AC-32,
 *  AC-56: native checkboxes, keyboard-operable by default) driving the
 *  compare modal on this same page. */
export function RunHistoryTable({
  runs,
  onCompare,
}: {
  runs: EvalRunRecord[];
  onCompare: (a: string, b: string) => void;
}) {
  const t = useTranslations("eval");
  const [selected, setSelected] = React.useState<string[]>([]);
  const na = t("notApplicable");

  if (runs.length === 0) {
    return <EmptyState icon="History" title={t("dashboard.recentRuns")} body={t("dashboard.noRuns")} />;
  }

  const toggle = (id: string) => {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_COMPARE_SELECTION) return [cur[cur.length - 1]!, id];
      return [...cur, id];
    });
  };

  return (
    <div>
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th} scope="col">
              {t("dashboard.table.select")}
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
              <td style={s.td}>
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={() => toggle(r.id)}
                  aria-label={`${t("dashboard.table.select")} — ${relativeTime(r.started_at)}`}
                />
              </td>
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
      {selected.length === MAX_COMPARE_SELECTION && (
        <div style={s.footer}>
          <Button kind="secondary" icon="ArrowRight" onClick={() => onCompare(selected[0]!, selected[1]!)}>
            {t("compare.open")}
          </Button>
        </div>
      )}
    </div>
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
