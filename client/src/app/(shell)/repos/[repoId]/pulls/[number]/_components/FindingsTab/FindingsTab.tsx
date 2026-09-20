"use client";

import React, { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory/RunHistory";
import { ReviewRunAccordion } from "../ReviewRunAccordion";
import { s } from "./styles";
import { allFindings } from "../../_lib/findings";
import {
  usePrReviews,
  usePrActiveRuns,
  usePrRuns,
  useCancelRun,
  useDeleteRun,
  reviewKeys,
} from "@/lib/api/reviews";
import type { PrCommit } from "@devdigest/shared";

interface FindingsTabProps {
  prId: string | null;
  prCommits: PrCommit[];
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onOpenTrace: (id: string) => void;
}

export function FindingsTab({
  prId,
  prCommits,
  repoFullName,
  headSha,
  onOpenTrace,
}: FindingsTabProps) {
  const qc = useQueryClient();
  const { data: reviews, refetch: refetchReviews } = usePrReviews(prId);
  const { data: activeRuns } = usePrActiveRuns(prId);
  const { data: prRuns } = usePrRuns(prId);
  const cancelMutation = useCancelRun();
  const deleteRun = useDeleteRun(prId);

  const runs = reviews ?? [];
  const liveRunIds = (activeRuns ?? []).map((r) => r.run_id);
  const reviewRunning = liveRunIds.length > 0;
  const lethalTrifecta = allFindings(runs).filter((f) => f.kind === "lethal_trifecta");

  // When a run settles (done OR failed) refresh both the live-run banner and
  // the full run history, so a just-failed run shows up in "Run history"
  // immediately — no page reload — plus refetch reviews for its findings.
  const onRunDone = useCallback(() => {
    if (prId) {
      qc.invalidateQueries({ queryKey: reviewKeys.activeRuns(prId) });
      qc.invalidateQueries({ queryKey: reviewKeys.runs(prId) });
    }
    refetchReviews();
  }, [prId, qc, refetchReviews]);

  const onDelete = useCallback(
    (id: string) => {
      if (window.confirm("Delete this run from history? (its logs are removed too)"))
        deleteRun.mutate(id);
    },
    [deleteRun],
  );

  const handleCancelAll = useCallback(() => {
    liveRunIds.forEach((id) => cancelMutation.mutate(id));
  }, [liveRunIds, cancelMutation]);

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

  // Timeline → Review-runs navigation: clicking an agent name in the timeline
  // opens + scrolls to that run's accordion below. The nonce re-triggers the
  // scroll even when the same run is clicked twice.
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(null);
  const handleGoToReview = useCallback((runId: string) => {
    setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
  }, []);

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
      {runs.length === 0 ? (
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
            runSummary={prRuns?.find((r) => r.run_id === review.run_id)}
            prId={prId}
            defaultOpen={i === 0}
            repoFullName={repoFullName}
            headSha={headSha}
            targetRunId={target?.runId ?? null}
            targetNonce={target?.n ?? 0}
          />
        ))
      )}
    </section>
  );
}
