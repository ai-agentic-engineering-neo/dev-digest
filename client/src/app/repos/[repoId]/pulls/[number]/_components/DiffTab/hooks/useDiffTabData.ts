import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { usePrReviews, usePrRuns, usePrComments, useCreatePrComment, useFindingAction } from "@/lib/hooks/reviews";
import type { PrFile } from "@devdigest/shared";
import { diffFindings, latestReviewsPerAgent, reviewTokens } from "../helpers";

export function useDiffTabData(prId: string | null, files: PrFile[]) {
  const smart = useSmartDiff(prId);
  const reviews = usePrReviews(prId);
  const runs = usePrRuns(prId);
  const comments = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const action = useFindingAction();

  const reviewList = reviews.data ?? [];
  const latest = latestReviewsPerAgent(reviewList);

  return {
    smart,
    comments,
    create,
    action,
    findings: diffFindings(reviewList, new Set(files.map((f) => f.path))),
    hasReview: latest.length > 0,
    /** False until the reviews query has data: "not run yet" must not flash while loading. */
    reviewsLoaded: reviews.isSuccess,
    tokens: runs.data ? reviewTokens(latest, runs.data) : null,
  };
}
