/**
 * PollingService + WorkspaceService (application ring) with in-memory fakes.
 * Polling only syncs the PR list (through the pulls import port) and never
 * triggers a review.
 */
import { describe, it, expect } from 'vitest';
import type { PrMeta } from '@devdigest/shared';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import { ConfigError, NotFoundError } from '../src/platform/errors.js';
import { PollingService } from '../src/modules/polling/service.js';
import { WorkspaceService } from '../src/modules/workspace/service.js';

const REPO = { id: 'repo-1', owner: 'acme', name: 'api' };

function build(github: () => Promise<MockGitHubClient>) {
  const imported: PrMeta[][] = [];
  const polled: string[] = [];
  const svc = new PollingService({
    polling: {
      findRepo: async (ws, id) => (ws === 'ws' && id === REPO.id ? REPO : null),
      markPolled: async (id) => void polled.push(id),
    },
    github,
    importPulls: async (_ws, _repoId, listed) => {
      imported.push(listed);
      return listed.length;
    },
  });
  return { svc, imported, polled };
}

describe('PollingService.poll', () => {
  it('imports the GitHub PR list, stamps last_polled_at, never triggers a review', async () => {
    const { svc, imported, polled } = build(async () => new MockGitHubClient());
    expect(await svc.poll('ws', REPO.id)).toEqual({ synced: 1, reviewTriggered: false });
    expect(imported).toHaveLength(1);
    expect(polled).toEqual([REPO.id]);
  });

  it('404s an unknown repo and surfaces a missing GitHub token', async () => {
    const { svc, polled } = build(async () => {
      throw new ConfigError('GITHUB_TOKEN is not configured');
    });
    await expect(svc.poll('ws', 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(svc.poll('ws', REPO.id)).rejects.toBeInstanceOf(ConfigError);
    expect(polled).toEqual([]);
  });
});

describe('WorkspaceService.overview', () => {
  it('summarises repos with their clone state', async () => {
    const svc = new WorkspaceService({
      cloneDir: '/clones',
      workspace: {
        listRepos: async () => [
          { id: 'r1', fullName: 'a/b', clonePath: '/clones/a/b', lastPolledAt: new Date('2026-06-01T00:00:00Z') },
          { id: 'r2', fullName: 'c/d', clonePath: null, lastPolledAt: null },
        ],
      },
    });
    expect(await svc.overview('ws')).toEqual({
      workspaceId: 'ws',
      cloneDir: '/clones',
      repos: [
        { id: 'r1', full_name: 'a/b', clone_path: '/clones/a/b', last_polled_at: '2026-06-01T00:00:00.000Z', cloned: true },
        { id: 'r2', full_name: 'c/d', clone_path: null, last_polled_at: null, cloned: false },
      ],
    });
  });
});
