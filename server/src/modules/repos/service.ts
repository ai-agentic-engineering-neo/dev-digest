import { type Repo } from '@devdigest/shared';
import { BadRequestError, NotFoundError } from '../../platform/errors.js';
import { INDEX_JOB_KIND, REFRESH_JOB_KIND } from '../repo-intel/index.js';
import { parseRepoUrl, canonicalCloneUrl, isValidRepoRef } from './domain.js';
import { CLONE_JOB_KIND, CLONE_DEPTH } from './constants.js';
import type { JobQueue, Logger, RepoCloner, RepoStore } from './ports.js';

/**
 * F1 — repos service. Business logic for the Repositories feature:
 *   - add / list / refresh / remove
 *   - the asynchronous `clone` job (real `git clone` via the GitClient adapter)
 *
 * No HTTP, no SQL and no container live here. Everything the service needs
 * from outside arrives as a port (ports.ts); pure rules are in domain.ts.
 */

/** Payload enqueued for (and consumed by) the `clone` job. */
export interface CloneJobPayload {
  repoId: string;
  owner: string;
  name: string;
  url: string;
}

export interface RepoServiceDeps {
  repos: RepoStore;
  git: RepoCloner;
  jobs: JobQueue;
  log: Logger;
}

export class RepoService {
  constructor(private deps: RepoServiceDeps) {}

  /**
   * Register the `clone` job handler once. Authenticates the clone with the
   * stored GitHub PAT (so private repos work), clones via the GitClient adapter,
   * then persists the resulting path + last_polled_at.
   */
  registerCloneJobHandler(): void {
    this.deps.jobs.register(CLONE_JOB_KIND, async (payload) => {
      await this.runCloneJob(payload as CloneJobPayload);
    });
  }

  async runCloneJob(payload: CloneJobPayload): Promise<void> {
    const { repoId, owner, name } = payload;
    // Never clone `payload.url`: jobs persist in the DB, and rows enqueued
    // earlier may carry an arbitrary user-supplied URL. Rebuild it from the
    // validated owner/name instead. Auth is the GitClient adapter's concern —
    // the token is never embedded in the URL (it would land in .git/config).
    if (!isValidRepoRef(owner, name)) {
      throw new BadRequestError('invalid_repo_url', `Refusing to clone invalid repo '${owner}/${name}'`);
    }
    const { path } = await this.deps.git.clone({ owner, name }, canonicalCloneUrl(owner, name), {
      depth: CLONE_DEPTH,
    });
    await this.deps.repos.markCloned(repoId, path);

    // T2.2 — kick off the indexer in the background. ENQUEUE (not call) so the
    // clone job closes immediately and the (heavier) index runs as its own
    // job under JobRunner's timeout/retry. If the handler isn't registered
    // (e.g. repo-intel disabled at module wiring), enqueue() throws — log and
    // continue so the clone result is preserved either way.
    const workspaceId = await this.deps.repos.workspaceIdFor(repoId);
    if (workspaceId) {
      try {
        await this.deps.jobs.enqueue(workspaceId, INDEX_JOB_KIND, {
          repoId,
          owner,
          name,
        });
      } catch {
        // No handler registered or transient enqueue failure — clone has
        // already succeeded, so we don't fail the job for an index-followup
        // miss. The user can hit POST /repos/:id/reindex to retry.
      }
    }
  }

  /**
   * Add a repo: parse the URL, dedupe within the workspace, persist, and enqueue
   * the real clone (non-blocking). `created` is false when the repo already
   * existed (the caller returns 200 instead of 201).
   */
  async add(
    workspaceId: string,
    userId: string,
    url: string,
  ): Promise<{ repo: Repo; created: boolean }> {
    const { owner, name, cloneUrl } = parseRepoUrl(url);
    const fullName = `${owner}/${name}`;

    const existing = await this.deps.repos.findByFullName(workspaceId, fullName);
    if (existing) return { repo: existing, created: false };

    const repo = await this.deps.repos.insert({ workspaceId, owner, name, fullName, createdBy: userId });
    await this.deps.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: repo.id,
      owner,
      name,
      url: cloneUrl,
    } satisfies CloneJobPayload);

    return { repo, created: true };
  }

  async list(workspaceId: string): Promise<Repo[]> {
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
      url: canonicalCloneUrl(repo.owner, repo.name),
    } satisfies CloneJobPayload);
    // T2.2 — also enqueue an incremental refresh. The two queue positions are
    // independent (p-queue doesn't FIFO across kinds), but `runIncremental` is
    // a no-op when `currentHead === lastIndexedSha`, so ordering is safe: if
    // refresh fires before the new clone settles, it cheaply exits; if after,
    // it picks up the new HEAD.
    try {
      await this.deps.jobs.enqueue(workspaceId, REFRESH_JOB_KIND, {
        repoId: repo.id,
        owner: repo.owner,
        name: repo.name,
      });
    } catch {
      // No handler / transient enqueue failure — refresh button is best-effort.
    }
    return { status: 'refreshing' };
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const repo = await this.deps.repos.getById(workspaceId, id);
    if (!repo) throw new NotFoundError('Repo not found');
    const ok = await this.deps.repos.remove(workspaceId, id);
    if (!ok) throw new NotFoundError('Repo not found');
    // The row is gone; the clone is disk-only cleanup. A failure here (or the
    // adapter's containment check refusing the path) must not turn a completed
    // removal into an error response.
    try {
      await this.deps.git.removeClone({ owner: repo.owner, name: repo.name });
    } catch (err) {
      this.deps.log.warn(
        { repoId: id, repo: repo.full_name, err: (err as Error).message },
        'repo removed but its clone directory could not be deleted',
      );
    }
  }
}
