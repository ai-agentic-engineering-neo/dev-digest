/* CiRunsView — /ci page (global CI Runs, Track E / T11). Lists every `source='ci'`
   agent run (backed by `agent_runs`, ingested from Actions artifacts). Rows with
   `pr_id === null` are external/fork PRs with no internal PR record — the PR
   column falls back to the raw `pr_number` instead of an internal link (AC-33).

   Refresh triggers the server pull-ingest (`POST /ci/refresh`); a degraded
   result surfaces a banner but never clears the currently rendered rows
   (AC-32) — see the "no invalidate on degraded" note in lib/hooks/ci-runs.ts.

   Note for Track D (owns messages/en/ci.json): the `runs.table` namespace is
   missing headers for Repository/Agent/Duration/Actions-job and there is no
   `runs.degraded` / load-error key yet — literal English fallbacks are used
   below for those until the namespace is extended. */
"use client";

import type { CSSProperties } from "react";
import { Badge, Button, EmptyState, ErrorState, Icon, MonoLink, Skeleton } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { RunCostBadge } from "@/components/RunCostBadge/RunCostBadge";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci-runs";
import { formatDuration, formatPrCell, formatTimestamp, statusMeta } from "./helpers";

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-muted)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "var(--text-secondary)",
  borderBottom: "1px solid var(--border)",
  whiteSpace: "nowrap",
};

// Literal fallbacks for headers/messages missing from the `ci.json` `runs`
// namespace (owned by Track D this batch) — see the file header note.
const FALLBACK = {
  repository: "Repository",
  agent: "Agent",
  duration: "Duration",
  actionsJob: "Actions job",
  degraded: "Refresh degraded — showing existing data.",
  loadError: "Could not load CI runs.",
};

export function CiRunsView() {
  const t = useTranslations("ci");
  const { data: runs, isLoading, isError, refetch } = useCiRuns();
  const refresh = useRefreshCiRuns();

  const crumb = [{ label: t("page.crumb") }];
  const degraded = refresh.data?.degraded === true;

  return (
    <AppShell crumb={crumb}>
      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t("runs.title")}</h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
              {t("runs.subtitle")}
            </p>
          </div>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            loading={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>

        {degraded && (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid var(--warn)",
              background: "var(--warn-bg)",
              color: "var(--warn)",
              fontSize: 13,
            }}
          >
            <Icon.AlertTriangle size={14} />
            {refresh.data?.message || FALLBACK.degraded}
          </div>
        )}

        {isLoading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={36} />
            <Skeleton height={36} />
            <Skeleton height={36} />
          </div>
        )}

        {isError && <ErrorState body={FALLBACK.loadError} onRetry={() => refetch()} />}

        {!isLoading && !isError && (runs?.length ?? 0) === 0 && (
          <EmptyState icon="Workflow" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        )}

        {!isLoading && !isError && (runs?.length ?? 0) > 0 && (
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
                {t("runs.title")}
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={thStyle}>
                    {t("runs.table.timestamp")}
                  </th>
                  <th scope="col" style={thStyle}>
                    {t("runs.table.pullRequest")}
                  </th>
                  <th scope="col" style={thStyle}>
                    {FALLBACK.repository}
                  </th>
                  <th scope="col" style={thStyle}>
                    {FALLBACK.agent}
                  </th>
                  <th scope="col" style={thStyle}>
                    {t("runs.table.status")}
                  </th>
                  <th scope="col" style={thStyle}>
                    {t("runs.table.findings")}
                  </th>
                  <th scope="col" style={thStyle}>
                    {t("runs.table.cost")}
                  </th>
                  <th scope="col" style={thStyle}>
                    {FALLBACK.duration}
                  </th>
                  <th scope="col" style={thStyle}>
                    {FALLBACK.actionsJob}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((run) => {
                  const meta = statusMeta(run.status);
                  const statusLabel = meta.labelKey
                    ? t(`runs.status.${meta.labelKey}`)
                    : (run.status ?? "–");
                  return (
                    <tr key={run.id}>
                      <td style={tdStyle}>{formatTimestamp(run.ran_at)}</td>
                      <td style={tdStyle}>{formatPrCell(run)}</td>
                      <td style={tdStyle}>{run.repo}</td>
                      <td style={tdStyle}>{run.agent ?? "–"}</td>
                      <td style={tdStyle}>
                        <Badge color={meta.color} bg={meta.bg} icon={meta.icon}>
                          {statusLabel}
                        </Badge>
                      </td>
                      <td style={tdStyle}>{run.findings_count ?? "–"}</td>
                      <td style={tdStyle}>
                        <RunCostBadge cost={run.cost_usd} />
                      </td>
                      <td style={tdStyle}>{formatDuration(run.duration_s)}</td>
                      <td style={tdStyle}>
                        {run.actions_job_url ? (
                          <MonoLink href={run.actions_job_url}>{t("runs.view")}</MonoLink>
                        ) : (
                          "–"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
