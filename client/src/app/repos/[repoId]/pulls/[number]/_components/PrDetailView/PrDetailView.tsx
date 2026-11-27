/* PR Detail view — /repos/:repoId/pulls/:number.
   - Findings panel (VerdictBanner + FindingCards)
   - RunReviewDropdown (run all / a specific agent) + live SSE RunStatus
   - File-by-file diff viewer in the Files tab
   Tab + open trace drawer live in the query string (?tab, ?trace). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePullByNumber } from "@/lib/hooks";
import {
  usePrReviews,
  useCancelRun,
  usePrActiveRuns,
  usePrRuns,
  useDeleteRun,
  useInvalidatePrRuns,
} from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import RunTraceDrawer from "../RunTraceDrawer";
import { useSearchParamState } from "./hooks/useSearchParamState";
import { s } from "./styles";

export function PrDetailView() {
  const t = useTranslations("prReview");
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const params = useSearchParamState();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data: pr, isLoading, isError, error, refetch } = usePullByNumber(repoId, Number(number));
  const prId = pr?.id ?? null;
  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const cancel = useCancelRun();
  const invalidateRuns = useInvalidatePrRuns(prId);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;

  const tab = params.get("tab") ?? "overview";
  const traceRunId = params.get("trace");
  const setTab = (next: string) => params.set("tab", next);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const allFindings = runs.flatMap((r) => r.findings);
  const lethalTrifecta = allFindings.filter((f) => f.kind === "lethal_trifecta");

  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoFullName ?? repoId, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("list.breadcrumb"), href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
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
        <div style={s.skeleton}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (isError || !pr || !prId) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("detail.loadErrorTitle")}
          body={error instanceof ApiError ? error.message : t("detail.loadErrorBody", { number })}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  const traceRun = traceRunId ? runs.find((r) => r.run_id === traceRunId) : undefined;

  return (
    <AppShell crumb={crumb}>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={allFindings.length}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={invalidateRuns.activeRuns}
      />

      <div style={s.body}>
        {tab === "overview" && <OverviewTab prBody={pr.body} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            liveRunIds={liveRunIds}
            reviewRunning={reviewRunning}
            lethalTrifecta={lethalTrifecta}
            runs={runs}
            prRuns={prRuns}
            prCommits={pr.commits}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            cancelMutation={cancel}
            onOpenTrace={(id) => params.set("trace", id)}
            onDelete={(id) => {
              if (window.confirm(t("detail.confirmDeleteRun"))) deleteRun.mutate(id);
            }}
            onRunDone={() => {
              invalidateRuns.activeRuns();
              invalidateRuns.history();
              refetchReviews();
            }}
          />
        )}

        {tab === "diff" && (
          <DiffTab
            prId={prId}
            filesCount={pr.files_count}
            files={pr.files}
            canComment={pr.status === "open"}
          />
        )}
      </div>

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={traceRun?.findings ?? []}
          agentName={traceRun?.agent_name ?? null}
          onClose={() => params.set("trace", null)}
        />
      )}
    </AppShell>
  );
}
