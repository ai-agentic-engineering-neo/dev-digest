/* PullsView — PR list screen for /repos/:repoId/pulls (GET /repos/:id/pulls).
   Status filter and sort are URL state (?status&sort, resolved by the route);
   the free-text query stays local so typing never round-trips to the server. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, EmptyState, ErrorState, AutoTriggerStatus } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePulls, useRefreshRepo } from "@/lib/hooks";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { COLUMN_KEYS, SKELETON_ROWS } from "../../constants";
import { s } from "../../styles";
import { PRRow } from "../PRRow";
import { FilterBar } from "../FilterBar";
import { countPulls, filterPulls, pullsHref, statusCounts, type PullsSearch } from "./helpers";
import type { PullsSort } from "./constants";

export function PullsView({ repoId, status, sort }: { repoId: string } & PullsSearch) {
  const t = useTranslations("prReview");
  const tc = useTranslations("common");
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading, isError, error, refetch } = usePulls(repoId);
  const refresh = useRefreshRepo();
  const [query, setQuery] = React.useState("");

  const navigate = (next: Partial<PullsSearch>) =>
    router.replace(pullsHref(repoId, { status, sort, ...next }), { scroll: false });

  const filtered = React.useMemo(
    () => filterPulls(pulls ?? [], { status, sort }, query),
    [pulls, status, sort, query],
  );
  const counts = countPulls(pulls ?? []);
  const chipCounts = React.useMemo(() => (pulls ? statusCounts(pulls) : undefined), [pulls]);
  const crumb = [{ label: activeRepo?.full_name ?? repoId, mono: true }, { label: t("list.breadcrumb") }];

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
            {pulls ? t("list.summary", counts) : t("list.loading")}
          </p>
        </div>
        <div style={s.headerActions}>
          <AutoTriggerStatus on={false} />
        </div>
      </div>

      <div style={s.tableCard}>
        <FilterBar
          active={status}
          counts={chipCounts}
          onActive={(next) => navigate({ status: next })}
          query={query}
          onQuery={setQuery}
          sort={sort}
          onSort={(next) => navigate({ sort: next as PullsSort })}
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
            onRetry={() => refetch()} retryLabel={tc("actions.retry")}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="GitPullRequest"
            title={t("list.emptyTitle")}
            body={status === "all" ? t("list.emptyAllBody") : t("list.emptyStatusBody", { status })}
          />
        ) : (
          filtered.map((pr, i) => (
            <PRRow
              key={pr.number}
              pr={pr}
              repoId={repoId}
              popoverUp={filtered.length > 3 && i >= filtered.length - 2}
            />
          ))
        )}
      </div>
    </AppShell>
  );
}
