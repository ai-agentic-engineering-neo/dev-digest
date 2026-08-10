import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewService } from './service.js';
import type { ReviewRepository, PullRow, ReviewRow, FindingRow } from './repository.js';

/**
 * Hermetic unit test for `ReviewService.smartDiff` — same "fake repo, no DB"
 * approach as recalculate-intent.test.ts.
 */

const PULL = { id: 'pr1', repoId: 'repo1', title: 'Add rate limiting', body: 'Closes #4' } as PullRow;

const FILES = [
  { path: 'src/foo.ts', additions: 5, deletions: 1 },
  { path: 'package-lock.json', additions: 20, deletions: 0 },
];

const FINDING = { file: 'src/foo.ts', startLine: 10, endLine: 12 } as FindingRow;

function buildService(overrides?: {
  getPull?: () => Promise<PullRow | undefined>;
  getPrFiles?: () => Promise<typeof FILES>;
  reviewsForPull?: () => Promise<{ review: ReviewRow; findings: FindingRow[] }[]>;
}) {
  const repo = {
    getPull: overrides?.getPull ?? (async () => PULL),
    getPrFiles: overrides?.getPrFiles ?? (async () => FILES),
    reviewsForPull:
      overrides?.reviewsForPull ?? (async () => [{ review: {} as ReviewRow, findings: [FINDING] }]),
  } as unknown as ReviewRepository;
  const service = new ReviewService(
    repo,
    {} as any,
    {} as any,
    {} as any,
    async () => ({ raw: '', files: [] }),
    async () => ({ signals: [] }),
  );
  return { service };
}

describe('ReviewService.smartDiff', () => {
  it('groups PR files by risk and merges the newest review\'s finding lines', async () => {
    const { service } = buildService();
    const result = await service.smartDiff('ws1', 'pr1');

    expect(result.groups.map((g) => g.role)).toEqual(['core', 'boilerplate']);
    const foo = result.groups[0]!.files.find((f) => f.path === 'src/foo.ts')!;
    const lock = result.groups[1]!.files.find((f) => f.path === 'package-lock.json')!;
    expect(foo.finding_lines).toEqual([10, 11, 12]);
    expect(lock.finding_lines).toEqual([]);
  });

  it('throws NotFoundError when the pull does not exist', async () => {
    const { service } = buildService({ getPull: async () => undefined });
    await expect(service.smartDiff('ws1', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('produces empty finding_lines on every file when the PR has no reviews yet', async () => {
    const { service } = buildService({ reviewsForPull: async () => [] });
    const result = await service.smartDiff('ws1', 'pr1');

    for (const group of result.groups) {
      for (const file of group.files) {
        expect(file.finding_lines).toEqual([]);
      }
    }
  });
});
