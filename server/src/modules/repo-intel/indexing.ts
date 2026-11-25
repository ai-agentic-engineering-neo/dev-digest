/**
 * Indexing use cases — T2.2 worker. The job handlers (registered via
 * registerIndexJobHandlers) are the ASYNC entry; the run functions are
 * SYNC-from-the-handler (they ARE the handler body). HTTP/Repo callers go
 * through `container.jobs.enqueue(INDEX_JOB_KIND, ...)` so the clone job
 * closes promptly and the index runs in the background.
 */
import type { RepoRef } from '@devdigest/shared';
import type { RepoIntelDeps } from './deps.js';
import type { IndexResult, IndexState } from './types.js';
import {
  INDEX_JOB_KIND,
  INDEXER_VERSION,
  REFRESH_JOB_KIND,
  RESYNC_JOB_KIND,
} from './constants.js';
import { runFullIndex, type IndexerDeps, type IndexPayload } from './pipeline/full.js';
import { runIncremental } from './pipeline/incremental.js';

type IndexingDeps = IndexerDeps & Pick<RepoIntelDeps, 'repository' | 'git'>;

/**
 * Run a full index of the repo INLINE (no enqueue). The job handler for
 * INDEX_JOB_KIND delegates to this, and tests / explicit calls can also
 * use it. The CI runner needs the synchronous variant — long-running CI
 * jobs already have their own time budget and don't want a second queue.
 */
export function indexRepo(d: IndexingDeps, repoId: string): Promise<IndexResult> {
  return runFullIndex(d, d.repository, { repoId });
}

/**
 * Run an incremental refresh INLINE. Same enqueue/inline split as indexRepo.
 * If the persisted state is missing or its `indexerVersion` is stale, this
 * delegates to `runFullIndex` internally.
 */
export function refreshIndex(d: IndexingDeps, repoId: string): Promise<IndexResult> {
  return runIncremental(d, d.repository, { repoId });
}

/**
 * Manual "re-analyze": advance the clone to `origin/<defaultBranch>` (so the
 * index reflects the latest code), then run an incremental refresh. The
 * incremental pass falls back to a full reindex internally when the diff base
 * is unreachable or the indexer version moved, so this is always
 * correct — never a destructive re-clone. Degrades (never throws) when the
 * repo isn't cloned yet or the fetch fails.
 */
export async function resyncRepo(d: IndexingDeps, repoId: string): Promise<IndexResult> {
  const startedAt = Date.now();
  const repo = await d.repository.getRepoBasics(repoId);
  if (!repo || !repo.clonePath) {
    return { status: 'degraded', filesIndexed: 0, filesSkipped: 0, durationMs: Date.now() - startedAt, reason: 'no_clone' };
  }
  const ref: RepoRef = { owner: repo.owner, name: repo.name };
  try {
    await d.git.sync(ref, repo.defaultBranch);
  } catch (err) {
    return {
      status: 'degraded',
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: Date.now() - startedAt,
      reason: `sync_failed:${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return runIncremental(d, d.repository, { repoId });
}

/** The inline runners the job handlers dispatch to (the facade passes its own methods). */
export interface IndexJobRunners {
  indexRepo(repoId: string): Promise<IndexResult>;
  refreshIndex(repoId: string): Promise<IndexResult>;
  resyncRepo(repoId: string): Promise<IndexResult>;
}

/**
 * Register the INDEX / REFRESH / RESYNC job handlers on the JobRunner — an
 * explicit one-shot at app startup (the module factory in index.ts invokes it).
 *
 * The handlers swallow the IndexResult on purpose — JobRunner expects
 * `Promise<void>`. Status/progress is observable via `repo_index_state`.
 */
export function registerIndexJobHandlers(
  jobs: RepoIntelDeps['jobs'],
  runners: IndexJobRunners,
): void {
  jobs.register(INDEX_JOB_KIND, async (payload) => {
    await runners.indexRepo((payload as IndexPayload).repoId);
  });
  jobs.register(REFRESH_JOB_KIND, async (payload) => {
    await runners.refreshIndex((payload as IndexPayload).repoId);
  });
  jobs.register(RESYNC_JOB_KIND, async (payload) => {
    await runners.resyncRepo((payload as IndexPayload).repoId);
  });
}

/**
 * ALWAYS works. If `repo_index_state` exists and has a row, returns it.
 * Otherwise synthesises a degraded row so callers can branch on `degraded`
 * without ever hitting a thrown error.
 */
export async function getIndexState(
  d: Pick<RepoIntelDeps, 'repository'>,
  repoId: string,
): Promise<IndexState> {
  const persisted = await d.repository.tryGetIndexState(repoId);
  if (persisted) return persisted;
  return {
    repoId,
    status: 'degraded',
    filesIndexed: 0,
    filesSkipped: 0,
    durationMs: 0,
    reason: 'no_data',
    lastIndexedSha: '',
    indexerVersion: INDEXER_VERSION,
    updatedAt: new Date(0),
    degraded: true,
    degradedReason: 'no_data',
  };
}
