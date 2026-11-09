import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { reviewCounts } from "../../helpers";
import type { BriefVerdict } from "./_components/PrBriefCard";

const RUN_DONE = "done";

/** Newest review (by created_at) whose run finished: no run id, or a run in the list with status done. Needs a verdict. */
export function newestFinishedReview(
  reviews: readonly ReviewRecord[],
  runs: readonly RunSummary[],
): ReviewRecord | null {
  const statusById = new Map(runs.map((r) => [r.run_id, r.status]));
  const newestFirst = [...reviews].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const review of newestFirst) {
    if (review.verdict === null) continue;
    if (review.run_id === null || statusById.get(review.run_id) === RUN_DONE) return review;
  }
  return null;
}

/** Verdict state for the brief card: error > loading/none > ready. */
export function toBriefVerdict(input: {
  reviews: ReviewRecord[] | undefined;
  runs: RunSummary[] | undefined;
  failed: boolean;
}): BriefVerdict {
  if (input.failed) return { state: "error" };
  if (!input.reviews || !input.runs) return { state: "none" };
  const review = newestFinishedReview(input.reviews, input.runs);
  if (!review || review.verdict === null) return { state: "none" };
  const { findings, blockers } = reviewCounts(review.findings);
  return {
    state: "ready",
    verdict: review.verdict,
    score: review.score,
    findings,
    blockers,
    agentName: review.agent_name ?? null,
    reviewedAt: review.created_at,
  };
}
