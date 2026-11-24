import { describe, it, expect } from 'vitest';
import { ReposService } from '../src/modules/repos/application/repos.service.js';
import { RepoNotFound } from '../src/modules/_shared/domain/errors.js';
import { InvalidRepoUrl } from '../src/modules/repos/domain/errors.js';
import type { JobHandler, JobScheduler } from '../src/modules/_shared/domain/jobs.js';
import type { ReposRepository } from '../src/modules/repos/domain/ports.js';
import type { Repo } from '../src/modules/repos/domain/types.js';

function setup(opts: { indexHandler?: boolean } = {}) {
  const rows = new Map<string, Repo>();
  const clones: Array<{ repoId: string; path: string }> = [];
  const cloneUrls: string[] = [];
  const enqueued: Array<{ kind: string; payload: unknown }> = [];
  const handlers = new Map<string, JobHandler>();
  const repos: ReposRepository = {
    findByFullName: async (ws, fn) => [...rows.values()].find((r) => r.workspaceId === ws && r.fullName === fn),
    list: async (ws) => [...rows.values()].filter((r) => r.workspaceId === ws),
    getById: async (ws, id) => (rows.get(id)?.workspaceId === ws ? rows.get(id) : undefined),
    insert: async (v) => {
      const r: Repo = { ...v, id: `r${rows.size + 1}`, defaultBranch: 'main', clonePath: null, lastPolledAt: null, createdAt: new Date(0) };
      rows.set(r.id, r);
      return r;
    },
    workspaceIdFor: async (id) => rows.get(id)?.workspaceId ?? null,
    recordClone: async (repoId, path) => void clones.push({ repoId, path }),
    remove: async (ws, id) => (rows.get(id)?.workspaceId === ws ? rows.delete(id) : false),
  };
  const jobs: JobScheduler = {
    register: (kind, h) => void handlers.set(kind, h),
    enqueue: async (_ws, kind, payload) => {
      if (kind === 'repo-intel-index' && !opts.indexHandler) throw new Error('no handler');
      enqueued.push({ kind, payload });
      return { id: `j${enqueued.length}` };
    },
  };
  const service = new ReposService({
    repos,
    jobs,
    git: () => ({
      clone: async (ref, url) => {
        cloneUrls.push(url);
        return { path: `/clones/${ref.owner}/${ref.name}` };
      },
    }),
    now: () => new Date(0),
  });
  return { service, clones, cloneUrls, enqueued, handlers };
}

describe('ReposService', () => {
  it('add persists once and enqueues a clone; a second add is a no-op', async () => {
    const { service, enqueued } = setup();
    const first = await service.add('w1', 'u1', 'https://github.com/acme/api.git');
    const second = await service.add('w1', 'u1', 'git@github.com:acme/api.git');
    expect(first.created).toBe(true);
    expect(second).toEqual({ repo: first.repo, created: false });
    expect(enqueued).toEqual([
      { kind: 'clone', payload: { repoId: first.repo.id, owner: 'acme', name: 'api', url: 'https://github.com/acme/api.git' } },
    ]);
  });

  it('add rejects a non-GitHub URL before touching storage', async () => {
    const { service, enqueued } = setup();
    await expect(service.add('w1', 'u1', 'https://evil.tld/acme/api')).rejects.toBeInstanceOf(InvalidRepoUrl);
    expect(enqueued).toHaveLength(0);
  });

  it('the clone job clones the canonical URL (never payload.url) and survives a missing index handler', async () => {
    const { service, clones, cloneUrls, handlers } = setup({ indexHandler: false });
    service.registerCloneJobHandler();
    const { repo } = await service.add('w1', 'u1', 'https://github.com/acme/api');
    await handlers.get('clone')!({ repoId: repo.id, owner: 'acme', name: 'api', url: 'file:///etc' }, { jobId: 'j1' });
    expect(cloneUrls).toEqual(['https://github.com/acme/api.git']);
    expect(clones).toEqual([{ repoId: repo.id, path: '/clones/acme/api' }]);
  });

  it('the clone job refuses an unsafe owner/name from a stored payload', async () => {
    const { service } = setup();
    await expect(service.runCloneJob({ repoId: 'r1', owner: '..', name: 'x', url: '' })).rejects.toBeInstanceOf(
      InvalidRepoUrl,
    );
  });

  it('refresh / remove raise RepoNotFound outside the workspace', async () => {
    const { service } = setup();
    const { repo } = await service.add('w1', 'u1', 'https://github.com/acme/api');
    await expect(service.refresh('w2', repo.id)).rejects.toBeInstanceOf(RepoNotFound);
    await expect(service.remove('w2', repo.id)).rejects.toBeInstanceOf(RepoNotFound);
    expect(await service.refresh('w1', repo.id)).toEqual({ status: 'refreshing' });
  });
});
