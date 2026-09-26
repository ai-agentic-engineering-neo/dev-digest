/* PR Detail — /repos/:repoId/pulls/:number. F2 shell extended by A2 with:
   - Findings panel (VerdictBanner + FindingCards)
   - RunReviewDropdown (run all / a specific agent) + live SSE RunStatus
   - Basic file-by-file diff viewer in the Files tab
   Tab state lives in query (?tab). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { Skeleton, ErrorState } from "@devdigest/ui";
import { useCrumb } from "@/components/app-shell";
import { PrDetailHeader } from "../PrDetailHeader";
import { OverviewTab } from "../OverviewTab";
import { FindingsTab } from "../FindingsTab";
import { DiffTab } from "../DiffTab";
import { parseSeverityParam } from "./helpers";
import RunTraceDrawer from "../RunTraceDrawer";
import { useTranslations } from "next-intl";
import { useConfirm } from "@/components/confirm-dialog";
import { useSearchParamState } from "@/lib/hooks/useSearchParamState";
import { usePullDetail, usePulls } from "@/lib/hooks";
import { usePrReviews, useCancelRun, usePrActiveRuns, usePrRuns, useDeleteRun, useInvalidateActiveRuns, useInvalidatePrRuns } from "@/lib/hooks/reviews";
import { useActiveRepo } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { githubPrUrl } from "@/lib/github-urls";
import type { FindingRecord } from "@devdigest/shared";

export function PrDetailView() {
  const t = useTranslations("prReview");
  const { confirm, dialog } = useConfirm();
  const params = useParams<{ repoId: string; number: string }>();
  const { repoId, number } = params;
  const { activeRepo } = useActiveRepo();
  // The route is keyed by PR number, but every PR API is keyed by the row's
  // uuid — resolve number → uuid via the (cached) pulls list before fetching.
  const { data: pulls, isLoading: pullsLoading } = usePulls(repoId);
  const prId = pulls?.find((p) => p.number === Number(number))?.id ?? null;
  const { data: pr, isLoading: detailLoading, isError, error, refetch } = usePullDetail(prId);

  const isLoading = pullsLoading || (prId != null && detailLoading);
  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);

  // Live run tracking is SERVER-SOURCED (agent_runs status='running'): survives
  // navigation AND reload, and self-clears via polling when runs finish.
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const deleteRun = useDeleteRun(prId);
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;
  const cancel = useCancelRun();
  const invalidateActiveRuns = useInvalidateActiveRuns(prId);
  // When a run settles (done OR failed) refresh the full run history too, so a
  // just-failed run shows up in "Run history" immediately — no page reload.
  const invalidateRunHistory = useInvalidatePrRuns(prId);

  const [tabParam, setTab] = useSearchParamState("tab");
  const tab = tabParam ?? "overview";
  const [traceRunId, setTraceRunId] = useSearchParamState("trace");
  // The severity filter lives in the URL, not in component state: it spans
  // every run's findings panel, survives back/forward, and makes "look at the
  // criticals on this PR" a link someone can send.
  const [severityParam, setSeverityFilter] = useSearchParamState("severity");
  const severityFilter = parseSeverityParam(severityParam);

  // Reviews come newest-first; each is its own run (grouped into accordions).
  const runs = reviews ?? [];
  const allFindings: FindingRecord[] = React.useMemo(
    () => runs.flatMap((r) => r.findings),
    [reviews],
  );
  const lethalTrifecta = allFindings.filter((f) => f.kind === "lethal_trifecta");
  const findingsCount = allFindings.length;

  const repoName = activeRepo?.full_name ?? repoId;
  // The real "owner/repo" (null until the repo is loaded) — used to build
  // github.com deep-links for the header and finding file references.
  const repoFullName = activeRepo?.full_name ?? null;
  useCrumb([
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("list.breadcrumb"), href: `/repos/${repoId}/pulls` },
    { label: `#${number}`, mono: true },
  ]);

  if (isLoading) {
    return (
      <div style={{ padding: "28px 32px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 1080, margin: "0 auto" }}>
        <Skeleton height={28} width={420} />
        <Skeleton height={16} width={300} />
        <Skeleton height={200} />
      </div>
    );
  }

  if (isError || !pr) {
    return (
      <ErrorState
        fullScreen
        title={t("detail.loadErrorTitle")}
        body={error instanceof ApiError ? error.message : t("detail.loadErrorBody", { number })}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <>
      <PrDetailHeader
        pr={pr}
        prId={prId}
        tab={tab}
        findingsCount={findingsCount}
        githubUrl={repoFullName ? githubPrUrl(repoFullName, pr.number) : null}
        onSetTab={setTab}
        onRunStart={() => setTab("findings")}
        onRunsStarted={() => invalidateActiveRuns()}
      />

      <div style={{ padding: "24px 32px 44px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1080, margin: "0 auto" }}>
        {tab === "overview" && <OverviewTab prId={prId} headSha={pr.head_sha} prBody={pr.body} />}

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
            onOpenTrace={setTraceRunId}
            onDelete={(id) => {
              confirm(
                {
                  title: t("timeline.deleteRunConfirm.title"),
                  body: t("timeline.deleteRunConfirm.body"),
                  confirmLabel: t("timeline.deleteRunConfirm.confirm"),
                },
                () => deleteRun.mutate(id),
              );
            }}
            onRunDone={() => {
              invalidateActiveRuns();
              invalidateRunHistory();
              refetchReviews();
            }}
            severityFilter={severityFilter}
            onSeverityChange={setSeverityFilter}
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
          onClose={() => setTraceRunId(null)}
        />
      )}
      {dialog}
    </>
  );
}
