/* PrDetailView — the PR detail screen: header + tabs (Overview / Agent runs /
   Files changed) + the run trace drawer. Tab and open trace live in the URL
   (?tab, ?trace) so they survive reload and can be shared. */
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { usePullDetail, usePulls } from "@/lib/hooks";
import { usePrActiveRuns, usePrReviews } from "@/lib/hooks/reviews";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import { PrDetailHeader } from "../PrDetailHeader";
import { PrDetailSkeleton } from "../PrDetailSkeleton";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import { RunTraceDrawer } from "../RunTraceDrawer";
import { countFindings, findPrId } from "./helpers";
import { usePrDetailSearch } from "./usePrDetailSearch";
import { s } from "./styles";

interface PrDetailViewProps {
  repoId: string;
  number: string;
}

export function PrDetailView({ repoId, number }: PrDetailViewProps) {
  const t = useTranslations("prReview");
  const tc = useTranslations("common");
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = findPrId(pulls, number);
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);
  const { data: reviews } = usePrReviews(prId);
  const { data: activeRuns, isPending: activeRunsPending } = usePrActiveRuns(prId);
  const { tab, traceRunId, setTab, openTrace, closeTrace } = usePrDetailSearch(repoId, number);

  // The real "owner/repo" (null until the repo is loaded) — for github.com deep-links.
  const repoFullName = activeRepo?.full_name ?? null;
  const pullsHref = `/repos/${repoId}/pulls`;
  const crumb = [
    { label: repoFullName ?? repoId, mono: true, href: pullsHref },
    { label: t("detail.crumbPulls"), href: pullsHref },
    { label: t("detail.crumbNumber", { number }), mono: true },
  ];

  const isLoading = pullsLoading || (prId != null && detailLoading);
  const traceReview = traceRunId ? reviews?.find((r) => r.run_id === traceRunId) : undefined;
  // An in-flight run streams its live log in the drawer. The drawer picks its
  // initial tab from `running`, so it mounts only once active runs are known.
  const traceRunning = !!traceRunId && (activeRuns ?? []).some((r) => r.run_id === traceRunId);

  let content: ReactNode;
  if (repoNotFound) {
    // Stale/unknown :repoId → friendly empty state instead of a 404 error.
    content = <RepoNotFound />;
  } else if (isLoading) {
    content = <PrDetailSkeleton />;
  } else if (isError || !pr || !prId) {
    content = (
      <ErrorState
        fullScreen
        title={t("detail.errorTitle")}
        body={error instanceof ApiError ? error.message : t("detail.errorBody", { number })}
        onRetry={() => refetch()} retryLabel={tc("actions.retry")}
      />
    );
  } else {
    content = (
      <>
        <PrDetailHeader
          pr={pr}
          prId={prId}
          tab={tab}
          findingsCount={countFindings(reviews)}
          githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
          onSetTab={setTab}
          onRunStart={() => setTab("findings")}
        />
        <div style={s.body}>
          {tab === "overview" && (
            <OverviewTab prId={prId} prBody={pr.body} repoFullName={repoFullName} headSha={pr.head_sha} />
          )}
          {tab === "findings" && (
            <FindingsTab
              prId={prId}
              commits={pr.commits}
              repoFullName={repoFullName}
              headSha={pr.head_sha}
              onOpenTrace={openTrace}
            />
          )}
          {tab === "diff" && (
            <DiffTab prId={prId} filesCount={pr.files_count} files={pr.files} canComment={pr.status === "open"} />
          )}
        </div>
        {traceRunId && !activeRunsPending && (
          <RunTraceDrawer
            runId={traceRunId}
            running={traceRunning}
            prNumber={pr.number}
            findings={traceReview?.findings ?? []}
            agentName={traceReview?.agent_name ?? null}
            onClose={closeTrace}
          />
        )}
      </>
    );
  }

  return <AppShell crumb={crumb}>{content}</AppShell>;
}
