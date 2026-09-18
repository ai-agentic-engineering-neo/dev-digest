"use client";

import React, { useCallback } from "react";
import { Icon, Badge, Button, SectionLabel, EmptyState } from "@devdigest/ui";
import { RunStatus } from "../RunStatus";
import { RunHistory } from "../RunHistory/RunHistory";
import { ReviewRunAccordion, type ReviewRunRow } from "../ReviewRunAccordion";
import { s } from "./styles";
import type { FindingRecord, ReviewRecord, RunSummary, PrCommit, Severity } from "@devdigest/shared";
import type { UseMutationResult } from "@tanstack/react-query";

interface FindingsTabProps {
  prId: string | null;
  liveRunIds: string[];
  reviewRunning: boolean;
  lethalTrifecta: FindingRecord[];
  runs: ReviewRecord[];
  prRuns: RunSummary[] | undefined;
  prCommits: PrCommit[];
  cancelMutation: UseMutationResult<{ ok: boolean }, Error, string, unknown>;
  /** owner/repo + head sha — used to deep-link a finding's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** Route identity — threaded down so the Timeline can build shareable links. */
  repoId?: string;
  prNumber?: number | string;
  /** Deep-link seeds read from the URL (?agent=&severity=). */
  initialAgentRunId?: string | null;
  initialSeverity?: Severity | null;
  onOpenTrace: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDone: () => void;
  /** Bubbled up on every target change so page.tsx can sync the URL. */
  onTargetChange?: (runId: string, severity: Severity | null) => void;
}

export function FindingsTab({
  prId,
  liveRunIds,
  reviewRunning,
  lethalTrifecta,
  runs,
  prRuns,
  prCommits,
  cancelMutation,
  repoFullName,
  headSha,
  repoId,
  prNumber,
  initialAgentRunId = null,
  initialSeverity = null,
  onOpenTrace,
  onDelete,
  onRunDone,
  onTargetChange,
}: FindingsTabProps) {
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
  const [target, setTarget] = React.useState<{ runId: string; n: number } | null>(
    initialAgentRunId ? { runId: initialAgentRunId, n: 1 } : null,
  );

  // PER-RUN applied state, deliberately separate from `target`: "who is the
  // current target" and "what was the last severity/nonce THIS panel was told
  // to apply" are different things the moment a panel stops being the target.
  // Deriving the second from the first (a live `isTarget` check) makes a
  // panel's FindingsPanel key flip back to its inert default when SOMEBODY ELSE
  // becomes the target — remounting it and wiping the user's own filter.
  // Each run's entry is untouched until that run is navigated to, and its nonce
  // only ever increases, so the invariant holds: a panel's key can never change
  // as a result of another run becoming the target.
  const [appliedByRunId, setAppliedByRunId] = React.useState<
    Record<string, { n: number; severity: Severity | null }>
  >(initialAgentRunId ? { [initialAgentRunId]: { n: 1, severity: initialSeverity } } : {});

  // The ONE writer of the URL's `agent`/`severity` pair. It remembers what it
  // last wrote so "does the URL currently hold another run's severity?" is
  // answered from the URL's real state — including writes made by a panel's
  // own severity pills, which never touch `target`/`appliedByRunId`.
  const urlRef = React.useRef<{ runId: string | null; severity: Severity | null }>({
    runId: initialAgentRunId,
    severity: initialSeverity,
  });
  const writeUrl = useCallback(
    (runId: string, severity: Severity | null) => {
      urlRef.current = { runId, severity };
      onTargetChange?.(runId, severity);
    },
    [onTargetChange],
  );

  const handleGoToReview = useCallback(
    (runId: string, severity?: Severity | null) => {
      const sev = severity ?? null;
      setTarget((p) => ({ runId, n: (p?.n ?? 0) + 1 }));
      setAppliedByRunId((p) => ({
        ...p,
        [runId]: { n: (p[runId]?.n ?? 0) + 1, severity: sev },
      }));
      writeUrl(runId, sev);
    },
    [writeUrl],
  );

  // Merely EXPANDING an accordion is not a navigation: it may only sync the URL
  // when doing so can't discard a `severity` that belongs to a different run
  // (the `agent`/`severity` pair is only meaningful together).
  const handleAccordionOpen = useCallback(
    (runId: string) => {
      const url = urlRef.current;
      if (url.severity && url.runId !== runId) return;
      writeUrl(runId, url.runId === runId ? url.severity : null);
    },
    [writeUrl],
  );

  // A run's severity PILLS (inside its expanded body) filter that panel in
  // place; this only mirrors the result into the URL — with `severity` when a
  // pill is active, without it once cleared. No remount: `appliedByRunId` is
  // deliberately left alone, since the panel already holds the new filter.
  const handlePanelFilterChange = useCallback(
    (runId: string | null, sev: Severity | null) => {
      if (runId) writeUrl(runId, sev);
    },
    [writeUrl],
  );

  // A severity badge in an accordion's OWN header behaves exactly like "go to
  // review, filtered" aimed at itself — otherwise the click writes ?severity=
  // to the URL while the panel right below it stays unfiltered, so a live click
  // and a reload of that very URL render differently.
  const handleHeaderSeverityClick = useCallback(
    (runId: string | null, sev: Severity) => {
      if (runId) handleGoToReview(runId, sev);
    },
    [handleGoToReview],
  );

  // A run whose only outcome was a FAILURE writes no ReviewRecord at all, so
  // the Review-runs list must merge `runs` (reviews) with the failed `prRuns`
  // that have no review — otherwise a PR whose only run failed shows
  // "No findings yet" and its error is unreachable from this section.
  const rows: ReviewRunRow[] = React.useMemo(() => {
    // Defensive `kind === "review"` filter, matching PRRow/RunHistory: only a
    // review-kind record counts as "this run already produced a review", so a
    // "summary"-kind row sharing a run_id can never suppress a failed run's row.
    const reviewedRunIds = new Set(
      runs.filter((r) => r.kind === "review").map((r) => r.run_id).filter(Boolean) as string[],
    );
    const failed: ReviewRunRow[] = (prRuns ?? [])
      .filter((r) => r.status === "failed" && !reviewedRunIds.has(r.run_id))
      .map((run) => ({ kind: "failed" as const, run }));
    const reviewed: ReviewRunRow[] = runs.map((review) => ({ kind: "review" as const, review }));
    const tsOf = (row: ReviewRunRow) =>
      Date.parse(
        (row.kind === "review" ? row.review.created_at : row.run.ran_at) ?? "",
      ) || 0;
    return [...reviewed, ...failed].sort((a, b) => tsOf(b) - tsOf(a));
  }, [runs, prRuns]);

  // `has_trace` is optional in the contract and a MISSING value means "unknown,
  // assume a trace may exist" — so the map keeps the raw tri-state and the read
  // below is `!== false`, the exact test RunHistory's own trace button uses.
  // Both components must decide identically given identical data.
  const hasTraceByRunId = React.useMemo(
    () => new Map((prRuns ?? []).map((r) => [r.run_id, r.has_trace])),
    [prRuns],
  );
  const costByRunId = React.useMemo(
    () => new Map((prRuns ?? []).map((r) => [r.run_id, r.cost_usd])),
    [prRuns],
  );

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
            reviews={runs}
            commits={prCommits}
            repoId={repoId}
            prNumber={prNumber}
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
      {rows.length === 0 ? (
        reviewRunning || liveRunIds.length > 0 ? null : (
          <EmptyState
            icon="Sparkles"
            title="No findings yet"
            body="Run a review to generate findings. Use Run Review ▾ above (run all enabled agents or a specific one)."
          />
        )
      ) : (
        prId &&
        rows.map((row, i) => {
          const runId = row.kind === "review" ? row.review.run_id : row.run.run_id;
          // Each row reads its OWN applied entry — never a value derived from
          // who the current target is (see `appliedByRunId` above).
          const applied = runId ? appliedByRunId[runId] : undefined;
          return (
            <ReviewRunAccordion
              key={row.kind === "review" ? row.review.id : `failed:${row.run.run_id}`}
              row={row}
              prId={prId}
              defaultOpen={i === 0}
              repoFullName={repoFullName}
              headSha={headSha}
              targetRunId={target?.runId ?? null}
              targetNonce={target?.n ?? 0}
              initialSeverity={applied?.severity ?? null}
              focusNonce={applied?.n ?? 0}
              hasTrace={runId ? hasTraceByRunId.get(runId) !== false : false}
              costUsd={runId ? costByRunId.get(runId) : undefined}
              onOpen={handleAccordionOpen}
              onOpenTrace={handleOpenTrace}
              onSeverityClick={(sev) => handleHeaderSeverityClick(runId, sev)}
              onFilterChange={(sev) => handlePanelFilterChange(runId, sev)}
            />
          );
        })
      )}
    </section>
  );
}
