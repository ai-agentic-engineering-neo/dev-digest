import { describe, it, expect } from 'vitest';
import type { PrMeta } from '@devdigest/shared';
import { PollingService } from '../src/modules/polling/application/polling.service.js';
import { RepoNotFound } from '../src/modules/_shared/domain/errors.js';
import type { PollingRepository } from '../src/modules/polling/domain/ports.js';

const pr = { number: 7, title: 'Fix', head_sha: 'abc' } as PrMeta;

function setup() {
  const calls: unknown[][] = [];
  const repos: PollingRepository = {
    findRepo: async (ws, id) => (ws === 'w1' && id === 'r1' ? { id: 'r1', owner: 'acme', name: 'api' } : undefined),
    recordPoll: async (...args) => {
      calls.push(args);
      return args[2].length;
    },
  };
  const at = new Date('2026-11-24T00:00:00Z');
  const service = new PollingService({
    repos,
    github: async () => ({ listPullRequests: async () => [pr, { ...pr, number: 8 }] }),
    now: () => at,
  });
  return { service, calls, at };
}

describe('PollingService', () => {
  it('syncs the PR list for the repo and never triggers a review', async () => {
    const { service, calls, at } = setup();
    expect(await service.poll('w1', 'r1')).toEqual({ synced: 2, reviewTriggered: false });
    expect(calls).toEqual([['w1', 'r1', [pr, { ...pr, number: 8 }], at]]);
  });

  it('raises RepoNotFound for a repo outside the workspace', async () => {
    const { service, calls } = setup();
    await expect(service.poll('w2', 'r1')).rejects.toBeInstanceOf(RepoNotFound);
    expect(calls).toHaveLength(0);
  });
});
