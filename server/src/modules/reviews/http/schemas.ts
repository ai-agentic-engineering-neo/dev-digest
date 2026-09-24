import { z } from 'zod';
import {
  ActiveRun,
  FindingRecord,
  ReviewRecord,
  ReviewRunResponse,
  RunRequest,
  RunSummary,
  RunTrace,
} from '@devdigest/shared';

/**
 * Request/response schemas of the reviews routes. Responses come from the
 * @devdigest/shared contracts the client types against, so the zod serializer
 * validates the output and strips nothing the client reads.
 */

/** A body-less POST arrives as null/undefined — treat it as {}. */
export const RunReviewBody = z.preprocess((v) => v ?? {}, RunRequest);

export const OkResponse = z.object({ ok: z.boolean() });

export const FindingActionResponse = z.object({ finding: FindingRecord });

export const ReviewRunResponseSchema = ReviewRunResponse;
export const ActiveRunsResponse = z.array(ActiveRun);
export const RunHistoryResponse = z.array(RunSummary);
export const RunTraceResponse = RunTrace;
export const ReviewsResponse = z.array(ReviewRecord);
