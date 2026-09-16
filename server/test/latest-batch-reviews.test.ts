import { describe, it, expect } from 'vitest';
import {
  latestBatchReviewsByPr,
  worstScore,
  type ReviewBatchRow,
} from '../src/modules/pulls/latest-batch-reviews.js';

function row(over: Partial<ReviewBatchRow>): ReviewBatchRow {
  return { id: 'rv-1', prId: 'pr-1', score: 100, runId: 'run-1', batchId: 'batch-1', ...over };
}

describe('latestBatchReviewsByPr', () => {
  it('a PR with a single review: the batch is just that review', () => {
    const out = latestBatchReviewsByPr([row({ id: 'rv-1', score: 90 })]);
    expect(out.get('pr-1')).toEqual([{ id: 'rv-1', score: 90 }]);
  });

  it('groups every review sharing the newest batch_id, even if a sibling review row was created earlier', () => {
    // Newest-first by created_at: the fast "no issues" agent's review lands
    // first even though it belongs to the same "Run Review" click as the
    // slower agent's review below it.
    const rows: ReviewBatchRow[] = [
      row({ id: 'rv-fast', score: 100, runId: 'run-fast', batchId: 'batch-1' }),
      row({ id: 'rv-slow', score: 50, runId: 'run-slow', batchId: 'batch-1' }),
    ];
    const out = latestBatchReviewsByPr(rows);
    expect(out.get('pr-1')).toEqual([
      { id: 'rv-fast', score: 100 },
      { id: 'rv-slow', score: 50 },
    ]);
  });

  it('excludes an older batch — only the newest batch_id counts', () => {
    const rows: ReviewBatchRow[] = [
      row({ id: 'rv-new', score: 80, batchId: 'batch-2' }), // newest (first in the newest-first list)
      row({ id: 'rv-old', score: 10, batchId: 'batch-1' }), // an earlier "Run Review" click
    ];
    const out = latestBatchReviewsByPr(rows);
    expect(out.get('pr-1')).toEqual([{ id: 'rv-new', score: 80 }]);
  });

  it('falls back to run_id when batch_id is null (pre-batch_id runs), without merging unrelated reviews', () => {
    const rows: ReviewBatchRow[] = [
      row({ id: 'rv-1', runId: 'run-1', batchId: null }),
      row({ id: 'rv-2', runId: 'run-2', batchId: null }),
    ];
    const out = latestBatchReviewsByPr(rows);
    // rv-1 is newest-first, so its key (run-1) is "the latest batch" — rv-2
    // (a different run) must NOT be swept in just because both are null.
    expect(out.get('pr-1')).toEqual([{ id: 'rv-1', score: 100 }]);
  });

  it('falls back to the review id itself when there is no linked run at all', () => {
    const rows: ReviewBatchRow[] = [row({ id: 'rv-1', runId: null, batchId: null })];
    const out = latestBatchReviewsByPr(rows);
    expect(out.get('pr-1')).toEqual([{ id: 'rv-1', score: 100 }]);
  });

  it('keeps PRs independent', () => {
    const rows: ReviewBatchRow[] = [
      row({ id: 'rv-1', prId: 'pr-1', batchId: 'batch-a' }),
      row({ id: 'rv-2', prId: 'pr-2', batchId: 'batch-b' }),
    ];
    const out = latestBatchReviewsByPr(rows);
    expect(out.get('pr-1')).toEqual([{ id: 'rv-1', score: 100 }]);
    expect(out.get('pr-2')).toEqual([{ id: 'rv-2', score: 100 }]);
  });

  it('empty input → empty map', () => {
    expect(latestBatchReviewsByPr([]).size).toBe(0);
  });
});

describe('worstScore', () => {
  it('picks the lowest score among the batch', () => {
    expect(worstScore([100, 76, 50])).toBe(50);
  });

  it('a single score is its own worst', () => {
    expect(worstScore([90])).toBe(90);
  });

  it('ignores nulls (e.g. a failed agent in the batch)', () => {
    expect(worstScore([80, null, 40])).toBe(40);
  });

  it('all null (or empty) → null, not 0', () => {
    expect(worstScore([null, null])).toBeNull();
    expect(worstScore([])).toBeNull();
  });
});
