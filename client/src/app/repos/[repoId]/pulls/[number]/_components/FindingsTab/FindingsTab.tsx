"use client";

import React, { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Button, SectionLabel, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory/RunHistory";
import { ReviewRunAccordion, reviewRunDomId } from "../ReviewRunAccordion";
import { s } from "./styles";
import type { FindingRecord, ReviewRecord, RunSummary, PrCommit } from "@devdigest/shared";
import type { UseMutationResult } from "@tanstack/react-query";

interface FindingsTabProps {
  prId: string | null;
  liveRunIds: string[];
  reviewRunning: boolean;
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  /** The reviews query is loading / failed — distinct from "no runs yet". */
  runsLoading?: boolean;
  runsError?: boolean;
  onRetryRuns?: () => void;
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  cancelMutation: Pick<UseMutationResult<unknown, Error, string>, "mutate" | "isPending">;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDone: () => void;
}

export function FindingsTab({
  prId,
  liveRunIds,
  reviewRunning,
  lethalTrifecta,
  runs,
  runsLoading = false,
  runsError = false,
  onRetryRuns,
  prRuns,
  prCommits,
  cancelMutation,
  repoFullName,
  headSha,
  onOpenTrace,
  onDelete,
  onRunDone,
}: FindingsTabProps) {
  const t = useTranslations("prReview");
  const handleCancelAll = useCallback(() => {
    liveRunIds.forEach((id) => cancelMutation.mutate(id));
  }, [liveRunIds, cancelMutation]);

  // run_id → cost of completed runs, for the review-run headers (M1). Reuses
  // the already-loaded run history instead of widening the reviews contract.
  const costByRunId = useMemo(
    () =>
      new Map(
        (prRuns ?? []).filter((r) => r.status === "done").map((r) => [r.run_id, r.cost_usd] as const),
      ),
    [prRuns],
  );

  const handleOpenFirstTrace = useCallback(() => {
    if (liveRunIds[0]) onOpenTrace(liveRunIds[0]);
  }, [liveRunIds, onOpenTrace]);

  const handleOpenTrace = useCallback(
    (id: string) => {
      onOpenTrace(id);
    },
    [onOpenTrace],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onDelete(id);
    },
    [onDelete],
  );

  // Open state per review run. A run's default is recorded the first time it is
  // seen (open when it is the newest), so a run arriving later does not collapse
  // the one that was open. Seeded during render (React's derive-from-props
  // pattern) rather than in an effect.
  const [openById, setOpenById] = React.useState<Record<string, boolean>>({});
  const unseen = runs.filter((r) => !(r.id in openById));
  if (unseen.length > 0) {
    const newestId = runs[0]?.id;
    setOpenById((prev) => ({
      ...prev,
      ...Object.fromEntries(unseen.map((r) => [r.id, r.id === newestId] as const)),
    }));
  }
  const toggleRun = (reviewId: string) =>
    setOpenById((prev) => ({ ...prev, [reviewId]: !prev[reviewId] }));

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below.
  const handleGoToReview = (runId: string) => {
    const review = runs.find((r) => r.run_id === runId);
    if (!review) return;
    setOpenById((prev) => ({ ...prev, [review.id]: true }));
    document.getElementById(reviewRunDomId(runId))?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section>
      {liveRunIds.length > 0 && (
        <div style={s.liveRunSection}>
          <SectionLabel
            icon="Sparkles"
            right={
              <div style={s.cancelActions}>
                <Button
                  kind="danger"
                  size="sm"
                  icon="X"
                  loading={cancelMutation.isPending}
                  onClick={handleCancelAll}
                >
                  Cancel
                </Button>
                <Button kind="ghost" size="sm" icon="FileText" onClick={handleOpenFirstTrace}>
                  Open run trace
                </Button>
              </div>
            }
          >
            Live review
          </SectionLabel>
          <RunStatus runIds={liveRunIds} onDone={onRunDone} />
        </div>
      )}

      {reviewRunning && (
        <div style={s.reviewInProgress}>
          <Icon.RefreshCw size={16} style={{ color: "var(--accent)", animation: "ddspin 1s linear infinite" }} />
          <span style={s.reviewInProgressText}>Review in progress…</span>
          <span style={s.reviewInProgressSub}>
            the agent is analyzing the diff — this can take a while on large PRs.
          </span>
        </div>
      )}

      {lethalTrifecta.length > 0 && (
        <div style={s.lethalTrifecta}>
          <Icon.Shield size={16} style={{ color: "var(--crit)" }} />
          <span style={s.lethalTrifectaTitle}>Lethal Trifecta detected</span>
          <Badge color="var(--crit)" bg="transparent">
            {lethalTrifecta.length} finding(s)
          </Badge>
        </div>
      )}

      {((prRuns && prRuns.length > 0) || prCommits.length > 0) && (
        <div style={s.timelineSection}>
          <SectionLabel
            icon="Activity"
            right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>runs &amp; commits · newest first</span>}
          >
            Timeline
          </SectionLabel>
          <RunHistory
            runs={prRuns ?? []}
            commits={prCommits}
            onOpenTrace={handleOpenTrace}
            onGoToReview={handleGoToReview}
            onDelete={handleDelete}
          />
        </div>
      )}

      <SectionLabel
        icon="AlertOctagon"
        right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>grouped by run · newest first</span>}
      >
        Review runs
      </SectionLabel>
      {runsLoading ? (
        <div style={s.reviewsLoading}>
          <Skeleton height={48} />
          <Skeleton height={48} />
        </div>
      ) : runsError ? (
        <ErrorState title={t("findingsTab.loadErrorTitle")} body={t("findingsTab.loadErrorBody")} onRetry={onRetryRuns} />
      ) : runs.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title="No findings yet"
            body="Run a review to generate findings. Use Run Review ▾ above (run all enabled agents or a specific one)."
          />
        )
      ) : (
        prId &&
        runs.map((review, i) => (
          <ReviewRunAccordion
            key={review.id}
            review={review}
            prId={prId}
            open={openById[review.id] ?? i === 0}
            onToggle={() => toggleRun(review.id)}
            repoFullName={repoFullName}
            headSha={headSha}
            costUsd={review.run_id ? costByRunId.get(review.run_id) ?? null : null}
          />
        ))
      )}
    </section>
  );
}
