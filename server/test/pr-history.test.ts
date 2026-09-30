import { describe, it, expect } from 'vitest';
import { PrHistoryService } from '../src/modules/pr-history/service.js';
import type { PullRow, PrFileRow } from '../src/db/rows.js';

/**
 * `PrHistoryService.historyForPull` — pure file-overlap logic, no DB. The
 * service's `container.pullsRepo` is stubbed with controlled rows, same
 * pattern as `repo-intel-blast-persistent.test.ts`.
 */
function pull(overrides: Partial<PullRow>): PullRow {
  return {
    id: 'p-current',
    workspaceId: 'ws1',
    repoId: 'r1',
    number: 10,
    title: 'current',
    author: 'a',
    branch: 'b',
    base: 'main',
    headSha: 'sha',
    lastReviewedSha: null,
    additions: 0,
    deletions: 0,
    filesCount: 0,
    status: 'open',
    body: null,
    openedAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    ...overrides,
  } as PullRow;
}

function file(prId: string, path: string): PrFileRow {
  return { id: `f-${prId}-${path}`, prId, path, additions: 1, deletions: 0, patch: null };
}

function buildService(opts: {
  currentPull: PullRow;
  currentFiles: PrFileRow[];
  otherPulls: PullRow[];
  otherFiles: { prId: string; path: string }[];
}): PrHistoryService {
  const container = {} as never;
  const svc = new PrHistoryService(container);
  (svc as unknown as { container: Record<string, unknown> }).container = {
    pullsRepo: {
      getPull: async () => opts.currentPull,
      getFiles: async () => opts.currentFiles,
      getOtherPrFiles: async () => opts.otherFiles,
      listByRepo: async () => opts.otherPulls,
    },
  };
  return svc;
}

describe('PrHistoryService.historyForPull', () => {
  it('finds prior PRs with file overlap, sorted by overlap count desc', async () => {
    const currentFiles = [file('p-current', 'a.ts'), file('p-current', 'b.ts'), file('p-current', 'c.ts')];
    const svc = buildService({
      currentPull: pull({}),
      currentFiles,
      otherPulls: [
        pull({ id: 'p-1', number: 1, title: 'small overlap', author: 'x' }),
        pull({ id: 'p-2', number: 2, title: 'big overlap', author: 'y' }),
        pull({ id: 'p-3', number: 3, title: 'no overlap', author: 'z' }),
      ],
      otherFiles: [
        { prId: 'p-1', path: 'a.ts' },
        { prId: 'p-2', path: 'a.ts' },
        { prId: 'p-2', path: 'b.ts' },
        { prId: 'p-3', path: 'unrelated.ts' },
      ],
    });

    const { history } = await svc.historyForPull('ws1', 'p-current');
    expect(history).toHaveLength(2); // p-3 has zero overlap, excluded
    expect(history[0]!.pr_number).toBe(2); // most overlap first
    expect(history[0]!.files_overlap).toEqual(['a.ts', 'b.ts']);
    expect(history[1]!.pr_number).toBe(1);
    expect(history[1]!.files_overlap).toEqual(['a.ts']);
    expect(history[0]!.notes).toBe('Touched 2 of 3 changed files in this PR.');
  });

  it('returns an empty history when no other PR shares a file', async () => {
    const svc = buildService({
      currentPull: pull({}),
      currentFiles: [file('p-current', 'only-mine.ts')],
      otherPulls: [pull({ id: 'p-1', number: 1 })],
      otherFiles: [{ prId: 'p-1', path: 'unrelated.ts' }],
    });
    const { history } = await svc.historyForPull('ws1', 'p-current');
    expect(history).toEqual([]);
  });

  it('returns an empty history (never throws) when the current PR has no changed files', async () => {
    const svc = buildService({
      currentPull: pull({}),
      currentFiles: [],
      otherPulls: [],
      otherFiles: [],
    });
    await expect(svc.historyForPull('ws1', 'p-current')).resolves.toEqual({ history: [] });
  });
});
