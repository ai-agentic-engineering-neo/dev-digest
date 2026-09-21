"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { CiRun } from "@devdigest/shared/contracts/eval-ci";
import { formatCost, relativeTime } from "@/lib/format";
import { statusLabelKey } from "./constants";
import { prLinkFor } from "./helpers";
import { s } from "./styles";

const STATUS_COLOR: Record<string, string> = {
  succeeded: "var(--ok, var(--text-secondary))",
  no_findings: "var(--ok, var(--text-secondary))",
  failed: "var(--crit, var(--danger))",
  running: "var(--text-secondary)",
};

const STATUS_ICON: Record<string, "CheckCircle" | "AlertTriangle" | "RefreshCw"> = {
  succeeded: "CheckCircle",
  no_findings: "CheckCircle",
  failed: "AlertTriangle",
  running: "RefreshCw",
};

/**
 * AC-27/AC-28/AC-32 — the CI Runs table: every row's cost renders through
 * `formatCost` (null → placeholder, distinct from a genuine $0.00 —
 * `client/LEARNINGS.md:15-29`), and the PR cell links to the resolved studio
 * or provider URL (`prLinkFor`), with a secondary provider link when it
 * differs (AC-30's "usable link out" for a run this drawer can't render —
 * see CiRunsView's header comment on the trace-drawer gap).
 */
export function CiRunsTable({ runs }: { runs: CiRun[] }) {
  const t = useTranslations("ci");

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th} scope="col">
            {t("runs.table.agent")}
          </th>
          <th style={s.th} scope="col">
            {t("runs.table.timestamp")}
          </th>
          <th style={s.th} scope="col">
            {t("runs.table.pullRequest")}
          </th>
          <th style={s.th} scope="col">
            {t("runs.table.source")}
          </th>
          <th style={s.th} scope="col">
            {t("runs.table.findings")}
          </th>
          <th style={s.th} scope="col">
            {t("runs.table.cost")}
          </th>
          <th style={s.th} scope="col">
            {t("runs.table.status")}
          </th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <CiRunRow key={r.id} run={r} />
        ))}
      </tbody>
    </table>
  );
}

function CiRunRow({ run }: { run: CiRun }) {
  const t = useTranslations("ci");
  const prLink = prLinkFor(run);
  const status = run.status ?? "running";
  const color = STATUS_COLOR[status] ?? "var(--text-secondary)";
  const StatusIcon = Icon[STATUS_ICON[status] ?? "AlertTriangle"];

  return (
    <tr>
      <td style={s.td}>{run.agent_name ?? "—"}</td>
      <td style={s.td}>{relativeTime(run.ran_at)}</td>
      <td style={s.td}>
        <div style={s.linkCell}>
          {prLink ? (
            <a href={prLink} target="_blank" rel="noreferrer">
              {run.pr_title ?? (run.pr_number != null ? `#${run.pr_number}` : run.repo ?? "—")}
            </a>
          ) : (
            <span>{run.pr_title ?? run.repo ?? "—"}</span>
          )}
          {run.github_url && run.github_url !== prLink && (
            <a href={run.github_url} target="_blank" rel="noreferrer" style={s.hint}>
              {t("runs.viewProvider")}
            </a>
          )}
          {run.status === "failed" && run.failure_reason && <span style={s.hint}>{run.failure_reason}</span>}
        </div>
      </td>
      <td style={s.td}>{run.source ?? "—"}</td>
      <td style={s.td}>{run.findings_count ?? "—"}</td>
      <td style={s.td}>{formatCost(run.cost_usd)}</td>
      <td style={s.td}>
        <span style={s.outcome(color)}>
          <StatusIcon size={12} />
          {t(`runs.status.${statusLabelKey(status)}`)}
        </span>
      </td>
    </tr>
  );
}
