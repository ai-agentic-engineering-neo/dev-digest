/* PR Detail — /repos/:repoId/pulls/:number. F2 shell extended by A2 with:
   - Findings panel (VerdictBanner + FindingCards)
   - RunReviewDropdown (run all / a specific agent) + live SSE RunStatus
   - Basic file-by-file diff viewer in the Files tab
   Tab state lives in query (?tab). */
"use client";

import { useParams } from "next/navigation";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { ShellCrumb } from "@/components/app-shell";
import { RepoNotFound } from "../../_components/RepoNotFound";
import { PrDetailHeader } from "./_components/PrDetailHeader";
import { OverviewTab } from "./_components/OverviewTab";
import { FindingsTab } from "./_components/FindingsTab";
import { DiffTab } from "./_components/DiffTab";
import RunTraceDrawer from "./_components/RunTraceDrawer";
import { usePrDetailParams } from "./_lib/usePrDetailParams";
import { allFindings } from "./_lib/findings";
import { s } from "./styles";
import { useQueryClient } from "@tanstack/react-query";
import { usePullDetail, usePulls } from "@/lib/api/pulls";
import { usePrReviews, reviewKeys } from "@/lib/api/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api/client";
import { githubPrUrl } from "./_lib/github-urls";

export default function PRDetailPage() {
  const params = useParams<{ repoId: string; number: string }>();
  const { repoId, number } = params;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);

  const isLoading = pullsLoading || (prId != null && detailLoading);
  // Also read by FindingsTab (same query key, cached) — kept here too because
  // RunTraceDrawer (a page-level sibling) and the header's findings count both
  // need it.
  const { data: reviews } = usePrReviews(prId);
  const runs = reviews ?? [];
  const findingsCount = allFindings(runs).length;
  const qc = useQueryClient();

  const { tab, traceRunId, setTab, setParam } = usePrDetailParams(repoId, number);

  const repoName = activeRepo?.full_name ?? repoId;
  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: "Pull Requests", href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ];

  // Stale/unknown :repoId → friendly empty state instead of a 404 error.
  if (repoNotFound) {
    return (
      <>
        <ShellCrumb items={crumb} />
        <RepoNotFound />
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <ShellCrumb items={crumb} />
        <div style={s.loadingWrap}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </>
    );
  }

  if (isError || !pr) {
    return (
      <>
        <ShellCrumb items={crumb} />
        <ErrorState
          fullScreen
          title="Couldn't load this pull request"
          body={error instanceof ApiError ? error.message : `PR #${number} could not be loaded.`}
          onRetry={() => refetch()}
        />
      </>
    );
  }

  return (
    <>
      <ShellCrumb items={crumb} />
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={findingsCount}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={() => {
          if (prId) qc.invalidateQueries({ queryKey: reviewKeys.activeRuns(prId) });
        }}
      />

      <div style={s.content}>
        {tab === "overview" && <OverviewTab prBody={pr.body} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            prCommits={pr.commits}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            onOpenTrace={(id) => setParam("trace", id)}
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

      {prId && traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={pr.number}
          findings={runs.find((r) => r.run_id === traceRunId)?.findings ?? []}
          agentName={runs.find((r) => r.run_id === traceRunId)?.agent_name ?? null}
          onClose={() => setParam("trace", null)}
        />
      )}
    </>
  );
}
