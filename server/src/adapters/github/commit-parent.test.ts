import { describe, it, expect } from 'vitest';
import { chooseCommitParent } from './commit-parent.js';

/**
 * The regression: `devdigest/ci` was merged into `main` and left undeleted, so
 * it stayed forked from its pre-merge point. Every later export layered onto
 * that stale tip, and GitHub kept diffing the PR against a merge base with no
 * `.devdigest/` — 36k additions on a repo whose `main` already had the same
 * files (burnjohn/quick-blog#29).
 */

describe('chooseCommitParent', () => {
  it('forks from base when the branch does not exist yet', () => {
    expect(chooseCommitParent({ branchSha: null, baseSha: 'base1', baseAheadBy: 0 })).toEqual({
      parentSha: 'base1',
      rebasedOntoBase: false,
    });
  });

  it('extends the branch when base has not moved — an ordinary republish', () => {
    expect(chooseCommitParent({ branchSha: 'branch1', baseSha: 'base1', baseAheadBy: 0 })).toEqual({
      parentSha: 'branch1',
      rebasedOntoBase: false,
    });
  });

  it('rebuilds on base when base carries commits the branch lacks', () => {
    // The merged-and-not-deleted case: base is one merge commit ahead.
    expect(chooseCommitParent({ branchSha: 'branch1', baseSha: 'base2', baseAheadBy: 1 })).toEqual({
      parentSha: 'base2',
      rebasedOntoBase: true,
    });
  });

  it('reports the rebase so the caller knows the ref update is not a fast-forward', () => {
    const choice = chooseCommitParent({ branchSha: 'branch1', baseSha: 'base9', baseAheadBy: 12 });
    expect(choice.rebasedOntoBase).toBe(true);
  });
});
