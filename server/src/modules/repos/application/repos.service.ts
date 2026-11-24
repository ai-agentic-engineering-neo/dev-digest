import { RepoNotFound } from '../../_shared/domain/errors.js';
import type { JobScheduler } from '../../_shared/domain/jobs.js';
import { INDEX_JOB_KIND, REFRESH_JOB_KIND } from '../../_shared/job-kinds.js';
import { CLONE_DEPTH, CLONE_JOB_KIND } from '../domain/constants.js';
import { InvalidRepoUrl } from '../domain/errors.js';
import { canonicalCloneUrl, isValidRepoRef, parseRepoUrl } from '../domain/policies.js';
import type { RepoCloner, ReposRepository } from '../domain/ports.js';
import type { CloneJobPayload, Repo } from '../domain/types.js';

export interface ReposDeps {
  repos: ReposRepository;
  jobs: JobScheduler;
  /** Resolved per job, so a test override or new token is picked up. */
  git: () => RepoCloner;
  now: () => Date;
}

/**
 * F1 — repositories: add / list / refresh / remove, and the asynchronous
 * `clone` job (real `git clone` through the GitClient port).
 */
export class ReposService {
  constructor(private readonly d: ReposDeps) {}

  /** Register the `clone` job handler (once, at module wiring). */
  registerCloneJobHandler(): void {
    this.d.jobs.register(CLONE_JOB_KIND, async (payload) => {
      await this.runCloneJob(payload as CloneJobPayload);
    });
  }

  async runCloneJob(payload: CloneJobPayload): Promise<void> {
    const { repoId, owner, name } = payload;
    // Never clone `payload.url`: job rows persist, and rows enqueued earlier may
    // carry an arbitrary user-supplied URL. Rebuild it from the validated
    // owner/name. Auth is the git adapter's concern — the token never goes into
    // the URL (it would land in .git/config).
    if (!isValidRepoRef(owner, name)) {
      throw new InvalidRepoUrl(`Refusing to clone invalid repo '${owner}/${name}'`);
    }
    const { path } = await this.d
      .git()
      .clone({ owner, name }, canonicalCloneUrl(owner, name), { depth: CLONE_DEPTH });
    await this.d.repos.recordClone(repoId, path, this.d.now());

    // Kick off the indexer as its own job (own timeout/retry) so the clone job
    // closes now. A missing handler (repo-intel disabled) or a transient enqueue
    // failure must not fail the clone — POST /repos/:id/reindex retries it.
    const workspaceId = await this.d.repos.workspaceIdFor(repoId);
    if (workspaceId) {
      try {
        await this.d.jobs.enqueue(workspaceId, INDEX_JOB_KIND, { repoId, owner, name });
      } catch {
        // best-effort follow-up
      }
    }
  }

  /**
   * Parse the URL, dedupe within the workspace, persist, enqueue the clone.
   * `created` is false when the repo already existed.
   */
  async add(workspaceId: string, userId: string, url: string): Promise<{ repo: Repo; created: boolean }> {
    const { owner, name, cloneUrl } = parseRepoUrl(url);
    const fullName = `${owner}/${name}`;

    const existing = await this.d.repos.findByFullName(workspaceId, fullName);
    if (existing) return { repo: existing, created: false };

    const repo = await this.d.repos.insert({ workspaceId, owner, name, fullName, createdBy: userId });
    await this.d.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: repo.id,
      owner,
      name,
      url: cloneUrl,
    } satisfies CloneJobPayload);
    return { repo, created: true };
  }

  list(workspaceId: string): Promise<Repo[]> {
    return this.d.repos.list(workspaceId);
  }

  /** Re-fetch the clone (fresh `clone` job) and request an incremental reindex. */
  async refresh(workspaceId: string, id: string): Promise<{ status: 'refreshing' }> {
    const repo = await this.d.repos.getById(workspaceId, id);
    if (!repo) throw new RepoNotFound();
    await this.d.jobs.enqueue(workspaceId, CLONE_JOB_KIND, {
      repoId: repo.id,
      owner: repo.owner,
      name: repo.name,
      url: canonicalCloneUrl(repo.owner, repo.name),
    } satisfies CloneJobPayload);
    // The two jobs aren't FIFO across kinds, but the incremental refresh is a
    // no-op when HEAD == last indexed sha, so either order is safe.
    try {
      await this.d.jobs.enqueue(workspaceId, REFRESH_JOB_KIND, {
        repoId: repo.id,
        owner: repo.owner,
        name: repo.name,
      });
    } catch {
      // best-effort
    }
    return { status: 'refreshing' };
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    if (!(await this.d.repos.remove(workspaceId, id))) throw new RepoNotFound();
  }
}
