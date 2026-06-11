/* PR list — /repos/:repoId/pulls. Ported from screen_dashboard.jsx; fetches
   GET /repos/:id/pulls (F1). Filters/sort live in query (?status&sort). */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Icon,
  Avatar,
  Badge,
  Chip,
  Button,
  Skeleton,
  EmptyState,
  ErrorState,
  AutoTriggerStatus,
  CircularScore,
  SEV,
} from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { RepoNotFound } from "../../../../components/RepoNotFound";
import { usePulls, useRefreshRepo } from "../../../../lib/hooks";
import { useActiveRepo, useRepoNotFound } from "../../../../lib/repo-context";
import { ApiError } from "../../../../lib/api";
import type { PrMeta } from "../../../../lib/types";
import {
  COLUMN_KEYS,
  FINDINGS_FIELDS,
  SIZE_COLOR,
  SKELETON_ROWS,
  STATUS_FILTERS,
  STATUS_META,
} from "./constants";
import { relativeTime, sizeOf } from "./helpers";
import { s } from "./styles";

/** Open PRs carry a derived review status; everything else is merged/closed. */
const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);

function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed
  const totalFindings =
    (pr.findings_critical ?? 0) + (pr.findings_warning ?? 0) + (pr.findings_suggestion ?? 0);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div style={s.findingsCell}>
        {!reviewed || totalFindings === 0 ? (
          <span style={s.muted}>—</span>
        ) : (
          FINDINGS_FIELDS.map(({ sev, field }) => {
            const n = pr[field] ?? 0;
            if (!n) return null;
            const meta = SEV[sev];
            const SIcon = Icon[meta.icon];
            return (
              <span key={sev} className="tnum" style={s.findingChip(meta.c)}>
                <SIcon size={13} />
                {n}
              </span>
            );
          })
        )}
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}

function FilterBar({
  active,
  onActive,
  onRefresh,
  refreshing,
}: {
  active: string;
  onActive: (k: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const t = useTranslations("prReview");
  return (
    <div style={s.filterBar}>
      <div style={s.filterChips}>
        {STATUS_FILTERS.map(({ key, labelKey }) => (
          <Chip key={key} active={active === key} onClick={() => onActive(key)}>
            {t(`list.filter.${labelKey}`)}
          </Chip>
        ))}
      </div>
      <div style={s.filterActions}>
        <Button
          kind="secondary"
          size="sm"
          icon="RefreshCw"
          onClick={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? t("list.refreshing") : t("list.refresh")}
        </Button>
      </div>
    </div>
  );
}

export default function PullsPage() {
  const t = useTranslations("prReview");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const search = useSearchParams();
  const router = useRouter();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading, isError, error, refetch } = usePulls(repoId);
  const refresh = useRefreshRepo();

  // Default to all (open PRs now carry a review status: needs_review/reviewed/stale).
  const status = search.get("status") ?? "all";
  const setStatus = (k: string) => {
    const sp = new URLSearchParams(search.toString());
    if (k === "all") sp.delete("status");
    else sp.set("status", k);
    router.replace(`/repos/${repoId}/pulls?${sp.toString()}`);
  };

  const filtered = (pulls ?? []).filter((p) => status === "all" || p.status === status);
  const repoName = activeRepo?.full_name ?? repoId;
  const openCount = (pulls ?? []).filter((p) => OPEN_STATUSES.has(p.status)).length;
  const needsReviewCount = (pulls ?? []).filter((p) => p.status === "needs_review").length;

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: repoName, mono: true }, { label: t("list.breadcrumb") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={[{ label: repoName, mono: true }, { label: t("list.breadcrumb") }]}>
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
              status === "all"
                ? t("list.emptyAllBody")
                : t("list.emptyStatusBody", { status })
            }
          />
        ) : (
          filtered.map((pr) => <PRRow key={pr.number} pr={pr} repoId={repoId} />)
        )}
      </div>
    </AppShell>
  );
}
