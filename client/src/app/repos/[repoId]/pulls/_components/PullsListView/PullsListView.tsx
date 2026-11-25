/* PR list — /repos/:repoId/pulls. Fetches GET /repos/:id/pulls (F1).
   The status filter lives in the query string (?status); text query and sort
   are local UI state. Filtering/sorting/counting are pure helpers. */
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, EmptyState, ErrorState, AutoTriggerStatus } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePulls } from "@/lib/hooks/pulls";
import { useRefreshRepo } from "@/lib/hooks/repos";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { useSetSearchParam } from "@/lib/search-params";
import { ALL_STATUSES, COLUMN_KEYS, DEFAULT_STATUS_FILTER, SKELETON_ROWS } from "../../constants";
import { countPulls, filterPulls } from "../../helpers";
import { s } from "../../styles";
import { PRRow } from "../PRRow";
import { FilterBar } from "../FilterBar";

export function PullsListView({ repoId }: { repoId: string }) {
  const t = useTranslations("prReview");
  const search = useSearchParams();
  const setParam = useSetSearchParam();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading, isError, error, refetch } = usePulls(repoId);
  const refresh = useRefreshRepo();

  const status = search.get("status") ?? DEFAULT_STATUS_FILTER;
  // Always explicit so "all" sticks over the needs_review default.
  const setStatus = (k: string) => setParam("status", k);

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("newest");

  const filtered = filterPulls(pulls ?? [], { status, query, sort });
  const counts = countPulls(pulls ?? []);
  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [{ label: repoName, mono: true }, { label: t("list.breadcrumb") }];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("list.title")}</h1>
          <p style={s.pageSubtitle}>
            {pulls
              ? t("list.summary", { open: counts.open, needsReview: counts.needsReview })
              : t("list.loading")}
          </p>
        </div>
        <div style={s.headerActions}>
          <AutoTriggerStatus on={false} />
        </div>
      </div>

      <div style={s.tableCard}>
        <FilterBar
          active={status}
          onActive={setStatus}
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={setSort}
          onRefresh={() => refresh.mutate(repoId)}
          refreshing={refresh.isPending}
        />
        <div style={s.headRow}>
          {COLUMN_KEYS.map((key, i) => (
            <div key={key} style={s.headCell(i === COLUMN_KEYS.length - 1)}>
              {t(`list.columns.${key}`)}
            </div>
          ))}
        </div>
        <PullsListBody
          isLoading={isLoading}
          error={isError ? error : null}
          onRetry={() => refetch()}
          status={status}
          pulls={filtered}
          repoId={repoId}
        />
      </div>
    </AppShell>
  );
}

/** Loading / error / empty / rows — early returns instead of a nested ternary. */
function PullsListBody({
  isLoading,
  error,
  onRetry,
  status,
  pulls,
  repoId,
}: {
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  status: string;
  pulls: ReturnType<typeof filterPulls>;
  repoId: string;
}) {
  const t = useTranslations("prReview");

  if (isLoading) {
    return (
      <div style={s.loadingStack}>
        {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
          <Skeleton key={i} height={28} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <ErrorState
        title={t("list.errorTitle")}
        body={error instanceof ApiError ? error.message : t("list.errorBody")}
        onRetry={onRetry}
      />
    );
  }
  if (pulls.length === 0) {
    return (
      <EmptyState
        icon="GitPullRequest"
        title={t("list.emptyTitle")}
        body={status === ALL_STATUSES ? t("list.emptyAllBody") : t("list.emptyStatusBody", { status })}
      />
    );
  }
  return (
    <>
      {pulls.map((pr) => (
        <PRRow key={pr.number} pr={pr} repoId={repoId} />
      ))}
    </>
  );
}
