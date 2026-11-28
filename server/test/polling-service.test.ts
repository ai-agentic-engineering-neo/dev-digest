/**
 * PollingService against in-memory ports: a manual poll imports the PR list
 * and stamps the repo, and never triggers a review.
 */
import { describe, it, expect } from 'vitest';
import type { PrMeta, Repo } from '@devdigest/shared';
import { PollingService } from '../src/modules/polling/service.js';

const repo: Repo = {
  id: 'repo-1',
  workspace_id: 'ws-1',
  owner: 'acme',
  name: 'widgets',
  full_name: 'acme/widgets',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

const prs = [{ number: 1 }, { number: 2 }] as PrMeta[];

describe('PollingService.pollRepo', () => {
  it('imports the PR list, marks the repo polled, and triggers no review', async () => {
    const imported: PrMeta[][] = [];
    const polled: string[] = [];
    const service = new PollingService({
      repos: {
        getById: async () => repo,
        markPolled: async (id) => void polled.push(id),
      },
      pulls: { upsertFromGitHub: async (_ws, _repo, pulls) => void imported.push(pulls) },
      github: async () => ({ listPullRequests: async () => prs }),
    });

    expect(await service.pollRepo('ws-1', repo.id)).toEqual({ synced: 2, reviewTriggered: false });
    expect(imported).toEqual([prs]);
    expect(polled).toEqual([repo.id]);
  });

  it('404s for an unknown repo before touching GitHub', async () => {
    let asked = false;
    const service = new PollingService({
      repos: { getById: async () => undefined, markPolled: async () => {} },
      pulls: { upsertFromGitHub: async () => {} },
      github: async () => {
        asked = true;
        return { listPullRequests: async () => [] };
      },
    });

    await expect(service.pollRepo('ws-1', 'nope')).rejects.toMatchObject({ code: 'not_found' });
    expect(asked).toBe(false);
  });
});
