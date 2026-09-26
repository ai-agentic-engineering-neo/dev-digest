/* PR list — /repos/:repoId/pulls. Ported from screen_dashboard.jsx; fetches
   GET /repos/:id/pulls (F1). Only the status filter lives in the URL (?status);
   text search and sort are local state — not shareable, and not in specs/pages.md. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Skeleton,
  EmptyState,
  ErrorState,
  AutoTriggerStatus,
} from "@devdigest/ui";
import { useCrumb } from "@/components/app-shell";
import { usePulls, useRefreshRepo } from "@/lib/hooks";
import { useSearchParamState } from "@/lib/hooks/useSearchParamState";
import { useActiveRepo } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { COLUMN_KEYS, RIGHT_ALIGNED_COLUMNS, SKELETON_ROWS } from "../../constants";
import { s } from "../../styles";
import { PRRow } from "../PRRow";
import { FilterBar } from "../FilterBar";
import { filterPulls, countOpen, countNeedsReview } from "./helpers";

export function PullsListView() {
  const t = useTranslations("prReview");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const { data: pulls, isLoading, isError, error, refetch } = usePulls(repoId);
  const refresh = useRefreshRepo();

  // Default to "needs review" — the most actionable filter on open.
  // setStatus always writes the param explicitly, so "all" sticks over the needs_review default.
  const [statusParam, setStatus] = useSearchParamState("status");
  const status = statusParam ?? "needs_review";

  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState("newest");

  const filtered = filterPulls(pulls ?? [], { status, query, sort });
  const repoName = activeRepo?.full_name ?? repoId;
  const openCount = countOpen(pulls ?? []);
  const needsReviewCount = countNeedsReview(pulls ?? []);

  useCrumb([{ label: repoName, mono: true }, { label: t("list.breadcrumb") }]);

  return (
    <>
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
          onSort={setSort}
          onRefresh={() => refresh.mutate(repoId)}
          refreshing={refresh.isPending}
        />
        <div style={s.headRow}>
          {COLUMN_KEYS.map((key) => (
            <div key={key} style={s.headCell(RIGHT_ALIGNED_COLUMNS.has(key))}>
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
              status === "all"
                ? t("list.emptyAllBody")
                : t("list.emptyStatusBody", { status })
            }
          />
        ) : (
          filtered.map((pr) => <PRRow key={pr.number} pr={pr} repoId={repoId} />)
        )}
      </div>
    </>
  );
}
