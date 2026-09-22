import type { PrCommit, RunSummary } from "@devdigest/shared";

export type OutcomeKey = "running" | "error" | "cancelled" | "rejected" | "reviewed" | "approved";

/**
 * The review OUTCOME, not just the run lifecycle: a finished run that found
 * blockers reads "rejected", never a green "done". Derived from the
 * denormalized blocker/finding counts on the run row, so it matches the CI gate
 * (deterministic) rather than the model's verdict.
 */
export function outcomeKey(run: Pick<RunSummary, "status" | "blockers" | "findings_count">): OutcomeKey {
  if (run.status === "running") return "running";
  if (run.status === "failed") return "error";
  if (run.status === "cancelled") return "cancelled";
  if ((run.blockers ?? 0) > 0) return "rejected";
  if ((run.findings_count ?? 0) > 0) return "reviewed";
  return "approved";
}

/**
 * Tokens spent by a run, or null when the usage line should be hidden. Settled
 * runs always show it; failed/cancelled ones only when they actually spent
 * tokens before the error (the server records that usage); running never.
 */
export function usageTokens(run: Pick<RunSummary, "status" | "tokens_in" | "tokens_out">): number | null {
  if (run.tokens_in == null && run.tokens_out == null) return null;
  const tokens = (run.tokens_in ?? 0) + (run.tokens_out ?? 0);
  if (run.status === "done") return tokens;
  if ((run.status === "failed" || run.status === "cancelled") && tokens > 0) return tokens;
  return null;
}

/** Epoch ms for sorting; unparseable / missing timestamps sort last. */
export function tsOf(s: string | null | undefined): number {
  if (!s) return 0;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

export type TimelineItem =
  | { kind: "run"; ts: number; run: RunSummary }
  | { kind: "commit"; ts: number; commit: PrCommit };

/** Runs and commits interleaved, newest first. */
export function timelineItems(runs: readonly RunSummary[], commits: readonly PrCommit[]): TimelineItem[] {
  return [
    ...runs.map((run) => ({ kind: "run" as const, ts: tsOf(run.ran_at), run })),
    ...commits.map((commit) => ({ kind: "commit" as const, ts: tsOf(commit.committed_at), commit })),
  ].sort((a, b) => b.ts - a.ts);
}
