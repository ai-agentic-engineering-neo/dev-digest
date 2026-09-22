import { describe, it, expect } from 'vitest';
import type { Repo } from '@devdigest/shared';
import { RepoService, type ReposStore } from '../src/modules/repos/service.js';
import { CLONE_JOB_KIND } from '../src/modules/repos/constants.js';
import { INDEX_JOB_KIND, REFRESH_JOB_KIND } from '../src/modules/repo-intel/constants.js';

const repo: Repo = {
  id: 'r1',
  workspace_id: 'ws1',
  owner: 'acme',
  name: 'widgets',
  full_name: 'acme/widgets',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: 'u1',
};

function setup(opts: { failKinds?: string[] } = {}) {
  const enqueued: Array<{ kind: string; payload: unknown }> = [];
  const clonePaths: string[] = [];
  const repos: ReposStore = {
    findByFullName: async () => undefined,
    list: async () => [repo],
    getById: async (ws, id) => (ws === 'ws1' && id === 'r1' ? repo : undefined),
    insert: async () => repo,
    workspaceIdFor: async () => 'ws1',
    updateClonePath: async (_id, path) => {
      clonePaths.push(path);
    },
    remove: async () => true,
  };
  const service = new RepoService({
    repos,
    git: { clone: async (ref) => ({ path: `/clones/${ref.owner}/${ref.name}` }) },
    jobs: {
      enqueue: async (_ws, kind, payload) => {
        if (opts.failKinds?.includes(kind)) throw new Error(`no handler for ${kind}`);
        enqueued.push({ kind, payload });
        return { id: `job-${enqueued.length}` };
      },
    },
  });
  return { service, enqueued, clonePaths };
}

describe('RepoService (ports faked)', () => {
  it('add persists and enqueues the clone job', async () => {
    const { service, enqueued } = setup();
    const res = await service.add('ws1', 'u1', 'https://github.com/acme/widgets');
    expect(res).toEqual({ repo, created: true });
    expect(enqueued).toEqual([
      { kind: CLONE_JOB_KIND, payload: { repoId: 'r1', owner: 'acme', name: 'widgets', url: 'https://github.com/acme/widgets' } },
    ]);
  });

  it('add rejects an unparseable URL with the invalid_repo_url code', async () => {
    const { service } = setup();
    await expect(service.add('ws1', 'u1', 'https://github.com/../src')).rejects.toMatchObject({
      code: 'invalid_repo_url',
      kind: 'invalid_input',
    });
  });

  it('the clone job stores the path and enqueues the index, even if that enqueue fails', async () => {
    const ok = setup();
    await ok.service.runCloneJob({ repoId: 'r1', owner: 'acme', name: 'widgets', url: 'u' });
    expect(ok.clonePaths).toEqual(['/clones/acme/widgets']);
    expect(ok.enqueued.map((j) => j.kind)).toEqual([INDEX_JOB_KIND]);

    const failing = setup({ failKinds: [INDEX_JOB_KIND] });
    await expect(
      failing.service.runCloneJob({ repoId: 'r1', owner: 'acme', name: 'widgets', url: 'u' }),
    ).resolves.toBeUndefined();
    expect(failing.clonePaths).toEqual(['/clones/acme/widgets']);
  });

  it('refresh re-clones from the https URL and best-effort enqueues an incremental refresh', async () => {
    const { service, enqueued } = setup({ failKinds: [REFRESH_JOB_KIND] });
    await expect(service.refresh('ws1', 'r1')).resolves.toEqual({ status: 'refreshing' });
    expect(enqueued).toEqual([
      {
        kind: CLONE_JOB_KIND,
        payload: { repoId: 'r1', owner: 'acme', name: 'widgets', url: 'https://github.com/acme/widgets.git' },
      },
    ]);
    await expect(service.refresh('other-ws', 'r1')).rejects.toMatchObject({ code: 'not_found' });
  });
});
