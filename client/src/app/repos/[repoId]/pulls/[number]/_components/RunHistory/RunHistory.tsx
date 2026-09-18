"use client";

import type { RunSummary, PrCommit, FindingRecord } from "@devdigest/shared";
import { CommitRow } from "./_components/CommitRow";
import { RunRow } from "./_components/RunRow";
import { type TimelineItem, tsOf } from "./helpers";
import { s } from "./styles";

/**
 * PR timeline — every agent run interleaved with the PR's commits, newest-first
 * and DB-backed so it survives reload. Showing commits between runs makes it
 * clear which commit each review ran against.
 */
export function RunHistory({
  runs,
  commits = [],
  findingsByRunId,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** This run's findings, keyed by run_id — drives the per-severity count
   *  chips (CRITICAL/WARNING/SUGGESTION) on each settled run row. Falls back
   *  to the plain "N finding(s)" text when a run has no matching entry. */
  findingsByRunId?: Record<string, FindingRecord[]>;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  if (runs.length === 0 && commits.length === 0) return null;

  const items: TimelineItem[] = [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({
      kind: "commit" as const,
      ts: tsOf(commit.committed_at),
      commit,
    })),
  ].sort((a, b) => b.ts - a.ts);

  return (
    <div style={s.wrap}>
      {items.map((item) =>
        item.kind === "commit" ? (
          <CommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <RunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            runFindings={findingsByRunId?.[item.run.run_id]}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}
