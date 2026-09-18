/**
 * PR-list SCORE ring + FINDINGS column: every review from a PR's LATEST
 * review batch (the set of agent_runs launched together by one "Run Review"
 * click, linked via agent_runs.batch_id) — not just whichever single review
 * row happens to have the newest `created_at`.
 *
 * LLM latency varies per agent, so the review that finishes (and is
 * persisted) last isn't necessarily representative of the whole batch: a
 * fast "no issues found" agent finishing after a slow agent that found a
 * CRITICAL would otherwise hide that CRITICAL from the list entirely.
 */

export interface ReviewBatchRow {
  id: string;
  prId: string;
  score: number | null;
  /** `reviews.run_id` — the agent_run that produced this review. */
  runId: string | null;
  /** The run's `batch_id` (joined from agent_runs); null for pre-batch_id runs. */
  batchId: string | null;
}

/** Groups a review with its batch-mates; each fallback still isolates it as
 *  a "batch of one" rather than merging unrelated reviews together. */
function batchKeyOf(rv: ReviewBatchRow): string {
  return rv.batchId ?? rv.runId ?? rv.id;
}

/**
 * `rows` MUST be sorted newest-first by review `created_at` — the first row
 * seen per PR anchors which batch counts as "latest" for that PR.
 */
export function latestBatchReviewsByPr(
  rows: ReviewBatchRow[],
): Map<string, { id: string; score: number | null }[]> {
  const latestKeyByPr = new Map<string, string>();
  for (const rv of rows) {
    if (!latestKeyByPr.has(rv.prId)) latestKeyByPr.set(rv.prId, batchKeyOf(rv));
  }

  const result = new Map<string, { id: string; score: number | null }[]>();
  for (const rv of rows) {
    if (batchKeyOf(rv) !== latestKeyByPr.get(rv.prId)) continue;
    const list = result.get(rv.prId) ?? [];
    list.push({ id: rv.id, score: rv.score });
    result.set(rv.prId, list);
  }
  return result;
}

/** PR-level score = the worst (lowest) score among its latest batch's agents. */
export function worstScore(scores: (number | null)[]): number | null {
  const nums = scores.filter((s): s is number => s != null);
  return nums.length > 0 ? Math.min(...nums) : null;
}
