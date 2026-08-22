/* MultiAgentResultsView — /repos/:repoId/multi-agent/:prId (Screens C/D).
   ONE useMultiAgentRun(prId) read feeds BOTH layouts; the layout toggle and
   the conflicts-only filter are client-side values — neither issues an
   additional request (AC-29, AC-41) nor makes any provider call (AC-31). */
"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { usePrReviews } from "@/lib/hooks/reviews";
import { usePullDetail } from "@/lib/hooks/core";
import { ApiError } from "@/lib/api";
import { formatCost } from "@/lib/format";
// Cross route-tree reuse (AC-43..46/D13): the SAME RunTraceDrawer the PR
// detail page mounts — no second drawer, no fork, no copy.
import RunTraceDrawer from "@/app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer";
import { ColumnsLayout } from "./_components/ColumnsLayout";
import { TabsLayout } from "./_components/TabsLayout";
import { ConflictsSection } from "./_components/ConflictsSection";
import { participatingCount, allFailed, sharedFailureReason } from "./helpers";
import { s } from "./styles";

export function MultiAgentResultsView() {
  const { repoId, prId } = useParams<{ repoId: string; prId: string }>();
  const router = useRouter();
  const t = useTranslations("runs");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data: run, isLoading, isError, error, refetch } = useMultiAgentRun(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: pr } = usePullDetail(prId);

  const [layout, setLayout] = React.useState<"columns" | "tabs">("columns");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);

  const repoName = activeRepo?.full_name ?? repoId;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("page.title"), href: `/repos/${repoId}/multi-agent` },
    { label: t("page.crumb") },
  ];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.loadingStack}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={220} />
        </div>
      </AppShell>
    );
  }

  // AC-51 — no multi-agent run exists yet for this PR: state it, offer the
  // route back to configure. A 404 is the expected shape (`useMultiAgentRun`
  // sets `retry: false` for exactly this case), not a real error.
  const notFound = error instanceof ApiError && error.status === 404;
  if (notFound || !run) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="Users"
          title={t("page.noRun.title")}
          body={t("page.noRun.bodyReady")}
          cta={t("page.noRun.cta")}
          onCta={() => router.push(`/repos/${repoId}/multi-agent?pr=${prId}`)}
        />
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn't load this multi-agent run"
          body={error instanceof ApiError ? error.message : undefined}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const conflictFiles = new Set(run.conflicts.map((c) => c.file));
  const participants = participatingCount(run.columns);
  const failedAll = allFailed(run.columns);
  const shared = sharedFailureReason(run.columns);
  const partial = !failedAll && run.columns.some((c) => c.status !== "done");
  const reviewByRun = new Map(
    (reviews ?? []).filter((r): r is typeof r & { run_id: string } => r.run_id != null).map((r) => [r.run_id, r]),
  );
  const traceColumn = traceRunId ? (run.columns.find((c) => c.run_id === traceRunId) ?? null) : null;

  return (
    <AppShell crumb={crumb}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>{t("page.title")}</h1>
          {/* AC-58 — the run-status region is announced as per-agent statuses
              settle (this line's inputs come straight from the polled read). */}
          <div style={s.pageSubtitle} role="status" aria-live="polite">
            {t("page.meta", {
              count: run.agent_count,
              duration: (run.total_duration_ms / 1000).toFixed(1),
              cost: formatCost(run.total_cost_usd),
            })}
          </div>
        </div>
        <div style={s.headerActions}>
          <div style={s.layoutToggle} role="group" aria-label={t("page.title")}>
            <button
              type="button"
              aria-pressed={layout === "columns"}
              style={s.layoutToggleBtn(layout === "columns")}
              onClick={() => setLayout("columns")}
            >
              {t("page.view.columns")}
            </button>
            <button
              type="button"
              aria-pressed={layout === "tabs"}
              style={s.layoutToggleBtn(layout === "tabs")}
              onClick={() => setLayout("tabs")}
            >
              {t("page.view.tabs")}
            </button>
          </div>
          <Button kind="secondary" size="sm" onClick={() => router.push(`/repos/${repoId}/multi-agent?pr=${prId}`)}>
            {t("page.startNewReview")}
          </Button>
        </div>
      </div>

      <div style={s.scoreLegend}>{t("page.scoreLegend")}</div>

      {failedAll && (
        <div role="status" aria-live="polite" style={s.banner(true)}>
          <div>{t("page.allFailed")}</div>
          {shared ? (
            <div>{t("page.sharedFailure", { reason: shared })}</div>
          ) : (
            run.columns.map((c) => (
              <div key={c.run_id}>
                {c.agent_name}: {c.error}
              </div>
            ))
          )}
        </div>
      )}
      {partial && (
        <div role="status" aria-live="polite" style={s.banner(false)}>
          {t("page.partial")}
        </div>
      )}

      <div style={s.body}>
        {layout === "columns" ? (
          <ColumnsLayout
            columns={run.columns}
            onlyConflicts={onlyConflicts}
            conflictFiles={conflictFiles}
            onOpenTrace={setTraceRunId}
          />
        ) : (
          <TabsLayout
            columns={run.columns}
            reviewByRun={reviewByRun}
            onlyConflicts={onlyConflicts}
            conflictFiles={conflictFiles}
            prId={prId}
            repoFullName={activeRepo?.full_name ?? null}
            headSha={pr?.head_sha}
            onOpenTrace={setTraceRunId}
          />
        )}

        <ConflictsSection
          conflicts={run.conflicts}
          participants={participants}
          onlyConflicts={onlyConflicts}
          onToggleOnly={() => setOnlyConflicts((v) => !v)}
        />
      </div>

      {traceColumn && (
        <RunTraceDrawer
          runId={traceColumn.run_id}
          prNumber={run.pr_number ?? undefined}
          agentName={traceColumn.agent_name}
          findings={reviewByRun.get(traceColumn.run_id)?.findings ?? []}
          running={traceColumn.status === "running"}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </AppShell>
  );
}
