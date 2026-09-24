import type { GitClient, Repo } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { githubCloneUrl, parseRepoUrl } from './helpers.js';
import { CLONE_JOB_KIND, CLONE_DEPTH } from './constants.js';
import { INDEX_JOB_KIND, REFRESH_JOB_KIND } from '../repo-intel/index.js';

/**
 * F1 — repos service. Business logic for the Repositories feature:
 *   - add / list / refresh / remove
 *   - the asynchronous `clone` job (real `git clone` via the GitClient port)
 *
 * No HTTP and no SQL here — persistence goes through the ReposStore port
 * (RepoRepository), background work through the JobQueue port.
 */

/** Payload enqueued for (and consumed by) the `clone` job. */
export interface CloneJobPayload {
  repoId: string;
  owner: string;
  name: string;
  url: string;
}

/** What the service needs from persistence (RepoRepository implements it). */
export interface ReposStore {
  findByFullName(workspaceId: string, fullName: string): Promise<Repo | undefined>;
  list(workspaceId: string): Promise<Repo[]>;
  getById(workspaceId: string, id: string): Promise<Repo | undefined>;
  insert(values: { workspaceId: string; owner: string; name: string; fullName: string; createdBy: string }): Promise<Repo>;
  workspaceIdFor(repoId: string): Promise<string | null>;
  updateClonePath(repoId: string, clonePath: string): Promise<void>;
  remove(workspaceId: string, id: string): Promise<boolean>;
}

/** Background-job queue (enqueue only). */
export interface JobQueue {
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<{ id: string }>;
}

export interface RepoServiceDeps {
  repos: ReposStore;
  git: Pick<GitClient, 'clone'>;
  jobs: JobQueue;
}

export class RepoService {
  constructor(private readonly deps: RepoServiceDeps) {}

  /**
   * The `clone` job body (registered in ./composition.ts). Clones via the
   * GitClient port (per-command PAT auth, so the token never lands in
   * .git/config), then persists the path. `signal` (job timeout / shutdown)
   * kills the git process.
   */
  async runCloneJob(payload: CloneJobPayload, opts: { signal?: AbortSignal } = {}): Promise<void> {
    const { repoId, owner, name, url } = payload;
    const { path } = await this.deps.git.clone({ owner, name }, url, {
      depth: CLONE_DEPTH,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    await this.deps.repos.updateClonePath(repoId, path);

    // Kick off the indexer in the background: ENQUEUE (not call) so the clone
    // job closes immediately and the heavier index runs as its own job. An
    // enqueue failure (no handler registered, transient) must not fail the
    // clone — the user can resync later.
    const workspaceId = await this.deps.repos.workspaceIdFor(repoId);
    if (workspaceId) {
      await this.tryEnqueue(workspaceId, INDEX_JOB_KIND, { repoId, owner, name });
    }
  }

  /**
   * Add a repo: parse the URL, dedupe within the workspace, persist, and enqueue
   * the real clone (non-blocking). `created` is false when the repo already
   * existed (the caller returns 200 instead of 201).
   */
  async add(workspaceId: string, userId: string, url: string): Promise<{ repo: Repo; created: boolean }> {
    const { owner, name } = parseRepoUrl(url);
    const fullName = `${owner}/${name}`;

    const existing = await this.deps.repos.findByFullName(workspaceId, fullName);
    if (existing) return { repo: existing, created: false };

    const repo = await this.deps.repos.insert({ workspaceId, owner, name, fullName, createdBy: userId });
    await this.deps.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: repo.id,
      owner,
      name,
      url,
    } satisfies CloneJobPayload);
    return { repo, created: true };
  }

  list(workspaceId: string): Promise<Repo[]> {
    return this.deps.repos.list(workspaceId);
  }

  /** Re-fetch the clone for an existing repo (enqueues a fresh `clone` job). */
  async refresh(workspaceId: string, id: string): Promise<{ status: 'refreshing' }> {
    const repo = await this.deps.repos.getById(workspaceId, id);
    if (!repo) throw new NotFoundError('Repo not found');
    await this.deps.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: repo.id,
      owner: repo.owner,
      name: repo.name,
      url: githubCloneUrl(repo.full_name),
    } satisfies CloneJobPayload);
    // Also enqueue an incremental refresh — ordering is safe: it is a no-op
    // when HEAD didn't move, and picks up the new HEAD once the clone settles.
    // Best-effort, like the post-clone index.
    await this.tryEnqueue(workspaceId, REFRESH_JOB_KIND, { repoId: repo.id, owner: repo.owner, name: repo.name });
    return { status: 'refreshing' };
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const ok = await this.deps.repos.remove(workspaceId, id);
    if (!ok) throw new NotFoundError('Repo not found');
  }

  private async tryEnqueue(workspaceId: string, kind: string, payload: unknown): Promise<void> {
    try {
      await this.deps.jobs.enqueue(workspaceId, kind, payload);
    } catch {
      // No handler / transient enqueue failure — the follow-up is best-effort.
    }
  }
}
