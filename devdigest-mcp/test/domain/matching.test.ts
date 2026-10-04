import { describe, expect, it } from 'vitest';
import type { PrMeta, Repo } from '@devdigest/shared';
import { matchPrByNumber, matchRepoByFullName } from '../../src/domain/matching.js';
import { prFixture, repoFixture } from '../helpers/fixtures.js';

const repos = [repoFixture(), repoFixture({ id: 'r2', full_name: 'Acme/Web' })] as unknown as Repo[];

describe('matching', () => {
  it('matches a repo case-insensitively and trimmed; misses return undefined', () => {
    expect(matchRepoByFullName(repos, '  ACME/api ')?.id).toBe('repo-1');
    expect(matchRepoByFullName(repos, 'acme/web')?.id).toBe('r2');
    expect(matchRepoByFullName(repos, 'acme/nope')).toBeUndefined();
  });

  it('matches a PR by number and ignores PRs without a persisted id', () => {
    const prs = [
      prFixture({ number: 7, id: null }),
      prFixture({ number: 8, id: undefined }),
      prFixture({ number: 42 }),
    ] as unknown as PrMeta[];
    expect(matchPrByNumber(prs, 42)?.id).toBe('pr-1');
    expect(matchPrByNumber(prs, 7)).toBeUndefined();
    expect(matchPrByNumber(prs, 8)).toBeUndefined();
    expect(matchPrByNumber(prs, 99)).toBeUndefined();
  });
});
