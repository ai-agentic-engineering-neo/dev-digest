import { describe, it, expect } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository, PullRow } from '../src/modules/reviews/repository.js';
import { loadDiff, diffFromPrFiles } from '../src/modules/reviews/diff-loader.js';

/**
 * SPEC-16 / plan 16, Phase 1 / T2 — `loadDiff` fallback order is pinned:
 * `git diff base...head` first, `pr_files` reconstruction second. I3 changes
 * the signature (structural deps instead of Container/schema row), so every
 * call goes through the single `callLoadDiff` factory below.
 */

const PULL = { id: 'pr-1', base: 'main', headSha: 'abc123' } as unknown as PullRow;
const REPO_ROW = { owner: 'acme', name: 'api' } as never;

type PrFile = { path: string; patch: string | null };

function callLoadDiff(opts: {
  git: () => Promise<UnifiedDiff>;
  prFiles: PrFile[] | (() => Promise<PrFile[]>);
}) {
  const gitArgs: unknown[][] = [];
  const prFilesIds: string[] = [];
  const container = {
    git: {
      diff: async (...args: unknown[]) => {
        gitArgs.push(args);
        return opts.git();
      },
    },
  } as unknown as Container;
  const repo = {
    getPrFiles: async (prId: string) => {
      prFilesIds.push(prId);
      return typeof opts.prFiles === 'function' ? opts.prFiles() : opts.prFiles;
    },
  } as unknown as ReviewRepository;
  return {
    result: loadDiff(container, repo, 'ws-1', PULL, REPO_ROW),
    gitArgs,
    prFilesIds,
  };
}

const GIT_DIFF = {
  raw: 'GIT RAW',
  files: [{ path: 'from-git.ts', additions: 1, deletions: 0, hunks: [] }],
} as unknown as UnifiedDiff;

const PATCH_A = '@@ -1,1 +1,2 @@\n ctx\n+added';
const PATCH_B = '@@ -5,1 +5,1 @@\n-old\n+new';

describe('loadDiff', () => {
  it('returns the git diff when it has files, without touching pr_files', async () => {
    const h = callLoadDiff({ git: async () => GIT_DIFF, prFiles: [{ path: 'x.ts', patch: PATCH_A }] });

    expect(await h.result).toBe(GIT_DIFF);
    expect(h.gitArgs).toEqual([[{ owner: 'acme', name: 'api' }, 'main', 'abc123']]);
    expect(h.prFilesIds).toEqual([]);
  });

  it('falls back to pr_files when git returns an empty file list', async () => {
    const h = callLoadDiff({
      git: async () => ({ raw: '', files: [] }) as unknown as UnifiedDiff,
      prFiles: [{ path: 'x.ts', patch: PATCH_A }],
    });

    const diff = await h.result;
    expect(h.prFilesIds).toEqual(['pr-1']);
    expect(diff.files.map((f) => f.path)).toEqual(['x.ts']);
  });

  it('falls back to pr_files when git throws', async () => {
    const h = callLoadDiff({
      git: async () => {
        throw new Error('clone missing');
      },
      prFiles: [{ path: 'x.ts', patch: PATCH_A }],
    });

    const diff = await h.result;
    expect(h.prFilesIds).toEqual(['pr-1']);
    expect(diff.files.map((f) => f.path)).toEqual(['x.ts']);
  });

  it('propagates a pr_files failure (only the git leg is swallowed)', async () => {
    const h = callLoadDiff({
      git: async () => {
        throw new Error('clone missing');
      },
      prFiles: async () => {
        throw new Error('db gone');
      },
    });
    await expect(h.result).rejects.toThrow('db gone');
  });
});

describe('diffFromPrFiles (synthetic diff)', () => {
  it('prefixes each patch with diff --git / --- / +++ headers, joined by newlines', async () => {
    const repo = {
      getPrFiles: async () => [
        { path: 'src/a.ts', patch: PATCH_A },
        { path: 'src/b.ts', patch: PATCH_B },
      ],
    } as unknown as ReviewRepository;

    const diff = await diffFromPrFiles(repo, 'pr-1');

    expect(diff.raw).toBe(
      [
        'diff --git a/src/a.ts b/src/a.ts',
        '--- a/src/a.ts',
        '+++ b/src/a.ts',
        PATCH_A,
        'diff --git a/src/b.ts b/src/b.ts',
        '--- a/src/b.ts',
        '+++ b/src/b.ts',
        PATCH_B,
      ].join('\n'),
    );
    expect(diff.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('skips files without a patch (null or empty string)', async () => {
    const repo = {
      getPrFiles: async () => [
        { path: 'bin.png', patch: null },
        { path: 'empty.txt', patch: '' },
        { path: 'src/a.ts', patch: PATCH_A },
      ],
    } as unknown as ReviewRepository;

    const diff = await diffFromPrFiles(repo, 'pr-1');

    expect(diff.raw).toBe(
      ['diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', PATCH_A].join('\n'),
    );
    expect(diff.files.map((f) => f.path)).toEqual(['src/a.ts']);
  });

  it('yields an empty diff when no file has a patch', async () => {
    const repo = { getPrFiles: async () => [{ path: 'x', patch: null }] } as unknown as ReviewRepository;
    const diff = await diffFromPrFiles(repo, 'pr-1');
    expect(diff.raw).toBe('');
    expect(diff.files).toEqual([]);
  });
});
