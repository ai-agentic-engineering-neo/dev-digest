/**
 * PR-list FINDINGS breakdown (`modules/pulls/severity.ts`) — per-review
 * severity counts from persisted findings, no model call.
 */
import { describe, it, expect } from 'vitest';
import {
  countSeveritiesByReview,
  latestReviewIdsPerAgent,
  sumSeverityCounts,
} from '../src/modules/pulls/severity.js';

describe('countSeveritiesByReview', () => {
  it('counts findings per severity for each listed review', () => {
    const m = countSeveritiesByReview(
      ['r1', 'r2'],
      [
        { reviewId: 'r1', severity: 'CRITICAL' },
        { reviewId: 'r1', severity: 'CRITICAL' },
        { reviewId: 'r1', severity: 'WARNING' },
        { reviewId: 'r2', severity: 'SUGGESTION' },
      ],
    );
    expect(m.get('r1')).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 0 });
    expect(m.get('r2')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 1 });
  });

  it('gives a review without findings all-zero counts', () => {
    expect(countSeveritiesByReview(['r1'], []).get('r1')).toEqual({
      CRITICAL: 0,
      WARNING: 0,
      SUGGESTION: 0,
    });
  });

  it('ignores rows of unlisted reviews and unknown severities', () => {
    const m = countSeveritiesByReview(
      ['r1'],
      [
        { reviewId: 'r1', severity: 'INFO' },
        { reviewId: 'other', severity: 'CRITICAL' },
      ],
    );
    expect(m.get('r1')).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(m.has('other')).toBe(false);
  });
});

describe('latestReviewIdsPerAgent + sumSeverityCounts', () => {
  it('keeps the newest review of each agent per PR (rows newest-first)', () => {
    const m = latestReviewIdsPerAgent([
      { id: 'perf-2', prId: 'p', agentId: 'perf' },
      { id: 'sec-1', prId: 'p', agentId: 'sec' },
      { id: 'perf-1', prId: 'p', agentId: 'perf' },
      { id: 'gen-1', prId: 'p', agentId: 'gen' },
      { id: 'other', prId: 'q', agentId: 'perf' },
    ]);
    expect(m.get('p')).toEqual(['perf-2', 'sec-1', 'gen-1']);
    expect(m.get('q')).toEqual(['other']);
  });

  it('treats agent-less reviews as one bucket', () => {
    const m = latestReviewIdsPerAgent([
      { id: 'new', prId: 'p', agentId: null },
      { id: 'old', prId: 'p', agentId: null },
    ]);
    expect(m.get('p')).toEqual(['new']);
  });

  it('sums counts across agents (an agent with 0 findings no longer hides the others)', () => {
    expect(
      sumSeverityCounts([
        { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
        { CRITICAL: 0, WARNING: 3, SUGGESTION: 1 },
        { CRITICAL: 1, WARNING: 2, SUGGESTION: 0 },
      ]),
    ).toEqual({ CRITICAL: 1, WARNING: 5, SUGGESTION: 1 });
  });
});
