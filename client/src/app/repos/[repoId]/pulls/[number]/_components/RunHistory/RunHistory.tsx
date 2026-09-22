/* RunHistory — PR timeline: every agent run interleaved with the PR's commits,
   newest first and DB-backed so it survives reload. Showing commits between
   runs makes it clear which commit each review ran against. */
"use client";

import type { RunSummary, PrCommit, FindingRecord } from "@devdigest/shared";
import { timelineItems } from "./helpers";
import { s } from "./styles";
import { CommitRow } from "./_components/CommitRow";
import { RunRow } from "./_components/RunRow";

interface RunHistoryProps {
  runs: RunSummary[];
  commits?: PrCommit[];
  /** run_id → the run's persisted findings (from the PR's reviews). A run with
   *  findings here shows per-severity counters with a read-only hover popover. */
  findingsByRun?: ReadonlyMap<string, FindingRecord[]>;
  /** Open the trace + log drawer for a run (the logs icon). */
  onOpenTrace: (runId: string) => void;
  /** Jump to this run's inline review accordion below (clicking the agent name). */
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}

export function RunHistory({
  runs,
  commits = [],
  findingsByRun,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: RunHistoryProps) {
  if (runs.length === 0 && commits.length === 0) return null;

  return (
    <div style={s.list}>
      {timelineItems(runs, commits).map((item) =>
        item.kind === "commit" ? (
          <CommitRow key={`commit:${item.commit.sha}`} commit={item.commit} />
        ) : (
          <RunRow
            key={`run:${item.run.run_id}`}
            run={item.run}
            findings={findingsByRun?.get(item.run.run_id)}
            onOpenTrace={onOpenTrace}
            onGoToReview={onGoToReview}
            onDelete={onDelete}
          />
        ),
      )}
    </div>
  );
}
