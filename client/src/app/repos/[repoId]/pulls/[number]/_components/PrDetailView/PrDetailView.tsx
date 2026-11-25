/* PR Detail — /repos/:repoId/pulls/:number.
   - Findings panel (VerdictBanner + FindingCards)
   - RunReviewDropdown (run all / a specific agent) + live SSE RunStatus
   - File-by-file diff viewer in the Files tab
   Tab and trace-drawer state live in the query string (?tab, ?trace).
   Data + run orchestration live in usePrDetailData; derivations in helpers. */
"use client";

import React from "react";
import { useSearchParams } from "next/navigation";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import { useSetSearchParam } from "@/lib/search-params";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import RunTraceDrawer from "../RunTraceDrawer";
import { usePrDetailData } from "./usePrDetailData";
import { findRun } from "./helpers";

const DEFAULT_TAB = "overview";
const CONTENT_STYLE: React.CSSProperties = {
  padding: "24px 32px 44px",
  display: "flex",
  flexDirection: "column",
  gap: 24,
  maxWidth: 1080,
  margin: "0 auto",
};
const LOADING_STYLE: React.CSSProperties = {
  padding: "28px 32px",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  maxWidth: 1080,
  margin: "0 auto",
};

export function PrDetailView({ repoId, number }: { repoId: string; number: string }) {
  const search = useSearchParams();
  const setParam = useSetSearchParam();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const data = usePrDetailData(repoId, number);
  const { pr, prId, runs } = data;

  const tab = search.get("tab") ?? DEFAULT_TAB;
  const traceRunId = search.get("trace");
  const setTab = (t: string) => setParam("tab", t);

  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  const crumb = [
    { label: repoFullName ?? repoId, mono: true, href: `/repos/${repoId}/pulls` },
    { label: "Pull Requests", href: `/repos/${repoId}/pulls` },
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

  if (data.isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={LOADING_STYLE}>
          <Skeleton height={28} width={420} />
          <Skeleton height={16} width={300} />
          <Skeleton height={200} />
        </div>
      </AppShell>
    );
  }

  if (data.isError || !pr) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title="Couldn't load this pull request"
          body={data.error instanceof ApiError ? data.error.message : `PR #${number} could not be loaded.`}
          onRetry={() => data.refetch()}
        />
      </AppShell>
    );
  }

  const traceRun = findRun(runs, traceRunId);

  return (
    <AppShell crumb={crumb}>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={data.findingsCount}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={data.onRunsStarted}
      />

      <div style={CONTENT_STYLE}>
        {tab === "overview" && <OverviewTab prBody={pr.body} />}

        {tab === "findings" && (
          <FindingsTab
            prId={prId}
            liveRunIds={data.liveRunIds}
            reviewRunning={data.reviewRunning}
            lethalTrifecta={data.lethalTrifecta}
            runs={runs}
            prRuns={data.prRuns}
            prCommits={pr.commits}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            cancelMutation={data.cancel}
            onOpenTrace={(id) => setParam("trace", id)}
            onDelete={(id) => {
              if (window.confirm("Delete this run from history? (its logs are removed too)"))
                data.deleteRun(id);
            }}
            onRunDone={data.onRunSettled}
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
          findings={traceRun?.findings ?? []}
          agentName={traceRun?.agent_name ?? null}
          onClose={() => setParam("trace", null)}
        />
      )}
    </AppShell>
  );
}
