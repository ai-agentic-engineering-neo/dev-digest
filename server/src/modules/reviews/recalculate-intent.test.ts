import { describe, expect, it, vi } from 'vitest';
import type { UnifiedDiff } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewService, type IntentResolveResult } from './service.js';
import type { ReviewRepository, PullRow } from './repository.js';
import type { RepoRow } from '../../db/rows.js';

/**
 * Hermetic unit test for `ReviewService.recalculateIntent` — the mentor-review
 * pass's standalone recompute flow (specs/05-intent-layer.md). No DB, no
 * network: `repo`/`loadDiffPort`/`resolveIntentPort` are all fakes, same
 * "declared by the consumer" ports the class itself defines.
 */

const PULL = { id: 'pr1', repoId: 'repo1', title: 'Add rate limiting', body: 'Closes #4' } as PullRow;
const REPO = { owner: 'acme', name: 'widgets', clonePath: '/tmp/acme-widgets' } as RepoRow;
const DIFF: UnifiedDiff = {
  raw: '',
  files: [
    {
      path: 'src/limiter.ts',
      additions: 4,
      deletions: 2,
      hunks: [
        {
          file: 'src/limiter.ts',
          oldStart: 1,
          oldLines: 2,
          newStart: 1,
          newLines: 4,
          newLineNumbers: [1, 2, 3, 4],
        },
      ],
    },
  ],
};

function buildService(overrides?: {
  getPull?: () => Promise<PullRow | undefined>;
  getRepo?: () => Promise<RepoRow | undefined>;
  resolveIntent?: () => Promise<IntentResolveResult>;
  loadDiff?: () => Promise<UnifiedDiff>;
}) {
  const repo = {
    getPull: overrides?.getPull ?? (async () => PULL),
    getRepo: overrides?.getRepo ?? (async () => REPO),
  } as unknown as ReviewRepository;
  const loadDiffPort = overrides?.loadDiff ?? vi.fn(async () => DIFF);
  const resolveIntentPort =
    overrides?.resolveIntent ??
    (async () => ({
      rendered: 'Adds rate limiting to the public API.',
      inScope: ['Rate limiter middleware'],
      outOfScope: ['Authentication changes'],
      contextGaps: [],
      signals: ['PR description'],
    }));
  const service = new ReviewService(
    repo,
    {} as any,
    {} as any,
    {} as any,
    loadDiffPort,
    resolveIntentPort,
  );
  return { service, loadDiffPort };
}

describe('ReviewService.recalculateIntent', () => {
  it('loads the diff, resolves intent, and reshapes it into IntentDetail', async () => {
    const { service, loadDiffPort } = buildService();
    const result = await service.recalculateIntent('ws1', 'pr1');

    expect(loadDiffPort).toHaveBeenCalledWith('ws1', PULL, REPO);
    expect(result).toEqual({
      intent: 'Adds rate limiting to the public API.',
      intent_in_scope: ['Rate limiter middleware'],
      intent_out_of_scope: ['Authentication changes'],
      intent_context_gaps: [],
      intent_signals: ['PR description'],
    });
  });

  it('nulls out fields the resolver omits (a degraded/failed resolution)', async () => {
    const { service } = buildService({
      resolveIntent: async () => ({ signals: [] }),
    });
    const result = await service.recalculateIntent('ws1', 'pr1');

    expect(result).toEqual({
      intent: null,
      intent_in_scope: null,
      intent_out_of_scope: null,
      intent_context_gaps: null,
      intent_signals: null,
    });
  });

  it('throws NotFoundError when the pull does not exist', async () => {
    const { service } = buildService({ getPull: async () => undefined });
    await expect(service.recalculateIntent('ws1', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError when the pull\'s repo does not exist', async () => {
    const { service } = buildService({ getRepo: async () => undefined });
    await expect(service.recalculateIntent('ws1', 'pr1')).rejects.toThrow(NotFoundError);
  });

  it('propagates a rejection from loadDiffPort', async () => {
    const { service } = buildService({
      loadDiff: async () => {
        throw new Error('git clone failed');
      },
    });
    await expect(service.recalculateIntent('ws1', 'pr1')).rejects.toThrow('git clone failed');
  });

  it('propagates a rejection from resolveIntentPort', async () => {
    const { service } = buildService({
      resolveIntent: async () => {
        throw new Error('LLM provider timed out');
      },
    });
    await expect(service.recalculateIntent('ws1', 'pr1')).rejects.toThrow('LLM provider timed out');
  });
});
