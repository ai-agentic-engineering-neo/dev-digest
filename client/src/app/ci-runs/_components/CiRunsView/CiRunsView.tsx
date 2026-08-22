"use client";

/**
 * specs/14-export-to-ci.md AC-26…AC-32 — the workspace-scoped CI Runs page
 * (NOT repo-scoped — modelled on `app/eval/page.tsx`, not the
 * `/repos/:repoId/...` template, per `client/LEARNINGS.md:404-416`).
 *
 * AC-30/trace-drawer gap: the already-committed `CiRun` API contract
 * (`server/src/vendor/shared/contracts/eval-ci.ts`) carries no
 * `agent_run_id` — only `agent`/`agent_name` (the display name) and
 * `provider_run_id` (the CI PROVIDER's run id, not this app's `agent_runs`
 * row). The shared `RunTraceDrawer` fetches a trace by `agent_runs.id`
 * (`useRunTrace` → `GET /runs/:id/trace`), so there is currently no id this
 * page can pass it that would resolve to real data — wiring one in anyway
 * would silently show "no trace available" for a run that DOES have one,
 * which is worse than not offering the affordance. Every row instead links
 * out to the CI provider's own run (`github_url`), which is always
 * resolvable. Flagged as a gap in Phase D's committed contract, not
 * something Phase E can close without a `CiRun.agent_run_id` field + a
 * `CiService`/`toContractRun` change on the server.
 */
import React from "react";
import { useTranslations } from "next-intl";
import { Button, Chip, EmptyState, ErrorState, SelectInput, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { AUTO_REFRESH_MS, DEFAULT_FILTERS, STATUS_ORDER, statusLabelKey, type CiRunsFilterState } from "./constants";
import { applyFilters, countByStatus, countBySource, uniqueAgentNames, uniqueRepos, uniqueSources } from "./helpers";
import { CiRunsTable } from "./CiRunsTable";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const [filters, setFilters] = React.useState<CiRunsFilterState>(DEFAULT_FILTERS);

  // AC-25 — the page's own read is stored rows only; no filter is sent to
  // the server (client-side filtering below), so this fires zero provider
  // calls on load.
  const { data: runs, isLoading, isError, refetch } = useCiRuns({});
  const refresh = useRefreshCiRuns();

  // AC-29 — re-query the provider at most once per installation per
  // interval, and only while this page is visible; never on mount (that
  // would violate AC-25's "loading produces zero provider calls").
  React.useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) refresh.mutate(false);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const all = runs ?? [];
  const filtered = applyFilters(all, filters);
  const statusCounts = countByStatus(all, filters);
  const sourceCounts = countBySource(all, filters);
  const agentOptions = uniqueAgentNames(all);
  const repoOptions = uniqueRepos(all);
  const sourceOptions = uniqueSources(all);

  const setField = <K extends keyof CiRunsFilterState>(key: K, value: CiRunsFilterState[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  if (isError) {
    return (
      <AppShell crumb={[{ label: t("page.crumb") }]}>
        <ErrorState fullScreen body={t("runs.emptyBody")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("runs.title")}</h1>
            <p style={s.subtitle}>{t("runs.subtitle")}</p>
          </div>
          <div style={s.refreshRow}>
            <span role="status" aria-live="polite" style={s.autoRefreshNote}>
              {refresh.isPending ? t("runs.refreshing") : t("runs.autoRefresh")}
            </span>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              onClick={() => refresh.mutate(true)}
              loading={refresh.isPending}
            >
              {t("runs.refresh")}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton height={200} />
        ) : all.length === 0 ? (
          <EmptyState icon="Play" title={t("runs.emptyTitle")} body={t("runs.emptyBody")} />
        ) : (
          <>
            <div style={s.filtersRow}>
              <SelectInput
                value={filters.dateRange}
                onChange={(v) => setField("dateRange", v as CiRunsFilterState["dateRange"])}
                options={[
                  { value: "last7", label: t("runs.filters.last7Days") },
                  { value: "all", label: t("runs.filters.allTime") },
                ]}
              />
              <SelectInput
                value={filters.agentName}
                onChange={(v) => setField("agentName", v)}
                options={[{ value: "", label: t("runs.filters.allAgents") }, ...agentOptions.map((a) => ({ value: a, label: a }))]}
              />
              <SelectInput
                value={filters.repo}
                onChange={(v) => setField("repo", v)}
                options={[{ value: "", label: t("runs.filters.allRepos") }, ...repoOptions.map((r) => ({ value: r, label: r }))]}
              />
              <div style={s.chipRow} role="group" aria-label={t("runs.filters.allStatuses")}>
                <Chip active={filters.status === ""} onClick={() => setField("status", "")}>
                  {t("runs.filters.allStatuses")}
                </Chip>
                {STATUS_ORDER.filter((st) => (statusCounts[st] ?? 0) > 0 || filters.status === st).map((st) => (
                  <Chip
                    key={st}
                    active={filters.status === st}
                    onClick={() => setField("status", st)}
                    count={statusCounts[st] ?? 0}
                  >
                    {t(`runs.status.${statusLabelKey(st)}`)}
                  </Chip>
                ))}
              </div>
              {sourceOptions.length > 1 && (
                <div style={s.chipRow} role="group" aria-label={t("runs.filters.allSources")}>
                  <Chip active={filters.source === ""} onClick={() => setField("source", "")}>
                    {t("runs.filters.allSources")}
                  </Chip>
                  {sourceOptions.map((src) => (
                    <Chip
                      key={src}
                      active={filters.source === src}
                      onClick={() => setField("source", src)}
                      count={sourceCounts[src] ?? 0}
                    >
                      {src}
                    </Chip>
                  ))}
                </div>
              )}
            </div>

            {filtered.length === 0 ? (
              <p style={s.hint}>{t("runs.noMatches")}</p>
            ) : (
              <CiRunsTable runs={filtered} />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
