/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  tallySeverityGroups,
  STALE_DAYS,
  ZERO_SEVERITY_COUNTS,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('tallySeverityGroups', () => {
  it('sums the per-severity GROUP BY counts into the uppercase contract shape', () => {
    expect(
      tallySeverityGroups([
        { severity: 'CRITICAL', n: 2 },
        { severity: 'WARNING', n: 1 },
        { severity: 'SUGGESTION', n: 4 },
      ]),
    ).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 4 });
  });

  it('ignores unknown severities — the column is plain text with no CHECK', () => {
    expect(
      tallySeverityGroups([
        { severity: 'CRITICAL', n: 1 },
        { severity: 'WEIRD', n: 9 },
      ]),
    ).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
  });

  it('is all-zero for no findings, and does not alias the frozen zero constant', () => {
    const tallied = tallySeverityGroups([]);
    expect(tallied).toEqual({ CRITICAL: 0, WARNING: 0, SUGGESTION: 0 });
    expect(tallied).not.toBe(ZERO_SEVERITY_COUNTS);
  });
});
