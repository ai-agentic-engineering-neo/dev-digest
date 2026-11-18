/** Boot reindex sweep (plan 19 / P1-E, AC-15/16/16a). */
import { describe, expect, it } from 'vitest';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';
import { INDEX_JOB_KIND, INDEXER_VERSION } from '../src/modules/repo-intel/constants.js';

function make(opts: { stale: Array<{ repoId: string; workspaceId: string }>; enqueueFails?: boolean }) {
  const calls: string[] = [];
  const repo = {
    listReposWithStaleIndex: async (v: number) => {
      calls.push(`stale:${v}`);
      return opts.stale;
    },
    setReindexProgress: async (id: string, s: string, d: number, t: number) => {
      calls.push(`progress:${id}:${s}:${d}:${t}`);
    },
    clearReindexState: async (id: string) => {
      calls.push(`clear:${id}`);
    },
  };
  const jobs = {
    register: () => undefined,
    enqueue: async (ws: string, kind: string, payload: unknown) => {
      if (opts.enqueueFails) throw new Error('no handler');
      calls.push(`enqueue:${ws}:${kind}:${(payload as { repoId: string }).repoId}`);
      return { id: 'j', done: Promise.reject(new Error('job failed')) };
    },
  };
  const svc = new RepoIntelService(repo as never, { jobs, repoIntelEnabled: true } as never);
  return { svc, calls };
}

describe('sweepStaleIndexes', () => {
  it('marks queued then enqueues one full index per stale repo; a rejecting job does not escape', async () => {
    const { svc, calls } = make({ stale: [{ repoId: 'r1', workspaceId: 'w1' }] });
    await expect(svc.sweepStaleIndexes()).resolves.toBe(1);
    expect(calls).toEqual([
      `stale:${INDEXER_VERSION}`,
      'progress:r1:queued:0:0',
      `enqueue:w1:${INDEX_JOB_KIND}:r1`,
    ]);
    await new Promise((r) => setTimeout(r, 5)); // let the swallowed rejection settle
  });

  it('a failed enqueue clears the queued marker', async () => {
    const { svc, calls } = make({ stale: [{ repoId: 'r1', workspaceId: 'w1' }], enqueueFails: true });
    await expect(svc.sweepStaleIndexes()).resolves.toBe(0);
    expect(calls).toContain('clear:r1');
  });

  it('registerIndexJobHandlers never throws or rejects unhandled when the repo layer is broken', async () => {
    const svc = new RepoIntelService({} as never, { jobs: { register: () => undefined }, repoIntelEnabled: true } as never);
    expect(() => svc.registerIndexJobHandlers()).not.toThrow();
    await new Promise((r) => setTimeout(r, 5));
  });
});
