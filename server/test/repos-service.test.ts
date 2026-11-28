/**
 * RepoService against in-memory ports — no database, no git, no container.
 * The service only knows `RepoStore`, `RepoCloner` and `JobQueue`
 * (modules/repos/ports.ts), so fakes are plain objects.
 */
import { describe, it, expect } from 'vitest';
import type { Repo } from '@devdigest/shared';
import { RepoService } from '../src/modules/repos/service.js';
import type { JobQueue, NewRepo, RepoStore } from '../src/modules/repos/ports.js';
import { CLONE_JOB_KIND } from '../src/modules/repos/constants.js';
import { INDEX_JOB_KIND } from '../src/modules/repo-intel/index.js';

class InMemoryRepoStore implements RepoStore {
  rows: Repo[] = [];

  async findByFullName(workspaceId: string, fullName: string) {
    return this.rows.find((r) => r.workspace_id === workspaceId && r.full_name === fullName);
  }
  async list(workspaceId: string) {
    return this.rows.filter((r) => r.workspace_id === workspaceId);
  }
  async getById(workspaceId: string, id: string) {
    return this.rows.find((r) => r.workspace_id === workspaceId && r.id === id);
  }
  async insert(values: NewRepo) {
    const repo: Repo = {
      id: `repo-${this.rows.length + 1}`,
      workspace_id: values.workspaceId,
      owner: values.owner,
      name: values.name,
      full_name: values.fullName,
      default_branch: 'main',
      clone_path: null,
      last_polled_at: null,
      created_by: values.createdBy,
    };
    this.rows.push(repo);
    return repo;
  }
  async workspaceIdFor(repoId: string) {
    return this.rows.find((r) => r.id === repoId)?.workspace_id ?? null;
  }
  async markCloned(repoId: string, clonePath: string) {
    const repo = this.rows.find((r) => r.id === repoId);
    if (repo) repo.clone_path = clonePath;
  }
  async remove(workspaceId: string, id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.workspace_id === workspaceId && r.id === id));
    return this.rows.length < before;
  }
}

function setup() {
  const repos = new InMemoryRepoStore();
  const enqueued: { workspaceId: string; kind: string; payload: unknown }[] = [];
  const jobs: JobQueue = {
    register: () => {},
    enqueue: async (workspaceId, kind, payload) => {
      enqueued.push({ workspaceId, kind, payload });
    },
  };
  const cloned: string[] = [];
  const removed: { owner: string; name: string }[] = [];
  const git = {
    removeClone: async (repo: { owner: string; name: string }) => {
      removed.push(repo);
    },
    clone: async (_repo: { owner: string; name: string }, url: string) => {
      cloned.push(url);
      return { path: '/clones/acme/widgets' };
    },
  };
  const warns: { obj: object; msg: string }[] = [];
  const log = { warn: (obj: object, msg: string) => void warns.push({ obj, msg }) };
  return { service: new RepoService({ repos, git, jobs, log }), warns, log, repos, enqueued, cloned, removed };
}

describe('RepoService', () => {
  it('adds a repo once: persists it, enqueues a clone, and dedupes the second add', async () => {
    const { service, repos, enqueued } = setup();

    const first = await service.add('ws-1', 'user-1', 'https://github.com/acme/widgets.git');
    expect(first.created).toBe(true);
    expect(first.repo.full_name).toBe('acme/widgets');
    expect(enqueued).toEqual([
      {
        workspaceId: 'ws-1',
        kind: CLONE_JOB_KIND,
        payload: {
          repoId: first.repo.id,
          owner: 'acme',
          name: 'widgets',
          url: 'https://github.com/acme/widgets.git',
        },
      },
    ]);

    const second = await service.add('ws-1', 'user-1', 'git@github.com:acme/widgets.git');
    expect(second.created).toBe(false);
    expect(second.repo.id).toBe(first.repo.id);
    expect(repos.rows).toHaveLength(1);
    expect(enqueued).toHaveLength(1);
  });

  it('clone job ignores the stored URL, records the clone path and enqueues indexing', async () => {
    const { service, repos, enqueued, cloned } = setup();
    const { repo } = await service.add('ws-1', 'user-1', 'https://github.com/acme/widgets');
    enqueued.length = 0;

    await service.runCloneJob({
      repoId: repo.id,
      owner: 'acme',
      name: 'widgets',
      url: 'https://evil.example/not-github.git',
    });

    expect(cloned).toEqual(['https://github.com/acme/widgets.git']);
    expect(repos.rows[0]?.clone_path).toBe('/clones/acme/widgets');
    expect(enqueued.map((j) => j.kind)).toEqual([INDEX_JOB_KIND]);

    await expect(
      service.runCloneJob({ repoId: repo.id, owner: '..', name: 'widgets', url: '' }),
    ).rejects.toMatchObject({ code: 'invalid_repo_url', statusCode: 400 });
  });

  it('remove deletes the row and the repo clone through the git port', async () => {
    const { service, repos, removed } = setup();
    const { repo } = await service.add('ws-1', 'user-1', 'https://github.com/acme/widgets');

    await service.remove('ws-1', repo.id);

    expect(repos.rows).toHaveLength(0);
    expect(removed).toEqual([{ owner: 'acme', name: 'widgets' }]);
  });

  it('remove still succeeds when the clone cannot be deleted', async () => {
    const { repos, service, warns, log } = setup();
    const { repo } = await service.add('ws-1', 'user-1', 'https://github.com/acme/widgets');
    const failing = new RepoService({
      repos,
      log,
      jobs: { register: () => {}, enqueue: async () => undefined },
      git: {
        clone: async () => ({ path: '' }),
        removeClone: async () => {
          throw new Error('EACCES');
        },
      },
    });
    await expect(failing.remove('ws-1', repo.id)).resolves.toBeUndefined();
    expect(warns).toHaveLength(1);
    expect(warns[0]?.obj).toMatchObject({ repo: 'acme/widgets', err: 'EACCES' });
    expect(repos.rows).toHaveLength(0);
  });

  it('remove reports a missing repo as not found', async () => {
    const { service } = setup();
    await expect(service.remove('ws-1', 'nope')).rejects.toMatchObject({ code: 'not_found' });
  });
});
