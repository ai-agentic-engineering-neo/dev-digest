/* PR list screen — /repos/:repoId/pulls. Filters/sort live in query (?status)
   plus local query/sort state. Extracted from the route file so page.tsx stays
   a thin Server Component; the filter/sort/count rules are pure functions in
   ../../helpers so they can be tested without rendering this screen. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, EmptyState, ErrorState, AutoTriggerStatus } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePulls, useRefreshRepo } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { COLUMN_KEYS, SKELETON_ROWS } from "../../constants";
import { visiblePulls, pullCounts, type SortKey } from "../../helpers";
import { s } from "../../styles";
import { PRRow } from "../PRRow";
import { FilterBar } from "../FilterBar";

export function PullsListView() {
  const t = useTranslations("prReview");
  const { repoId } = useParams<{ repoId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading, isError, error, refetch } = usePulls(repoId);
  const refresh = useRefreshRepo();

  // Default to "needs review" — the most actionable filter on open.
  const status = search.get("status") ?? "needs_review";
  const setStatus = (k: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("status", k); // always explicit so "all" sticks over the needs_review default
    router.replace(`/repos/${repoId}/pulls?${sp.toString()}`);
  };

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("newest");

  const filtered = visiblePulls(pulls ?? [], { status, query, sort });
  const { open: openCount, needsReview: needsReviewCount } = pullCounts(pulls ?? []);
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
              ? t("list.summary", { open: openCount, needsReview: needsReviewCount })
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
          onSort={(k) => setSort(k as SortKey)}
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

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <Skeleton key={i} height={28} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("list.errorTitle")}
            body={error instanceof ApiError ? error.message : t("list.errorBody")}
            onRetry={() => refetch()}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="GitPullRequest"
            title={t("list.emptyTitle")}
            body={
              status === "all" ? t("list.emptyAllBody") : t("list.emptyStatusBody", { status })
            }
          />
        ) : (
          filtered.map((pr) => <PRRow key={pr.number} pr={pr} repoId={repoId} />)
        )}
      </div>
    </AppShell>
  );
}

export default PullsListView;
