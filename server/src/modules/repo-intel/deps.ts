import type { CodeIndex, GitClient } from '@devdigest/shared';
import type { JobScheduler } from '../_shared/domain/jobs.js';
import type { RepoIntelRepository } from './repository.js';
import type { IndexerDeps } from './pipeline/full.js';

/**
 * Everything the facade and its indexer need; built in platform/container.ts.
 * Lives in its own file (re-exported by service.ts) so the use-case files can
 * take a `Pick<RepoIntelDeps, …>` without importing the facade (no cycle).
 */
export interface RepoIntelDeps extends IndexerDeps {
  repository: RepoIntelRepository;
  git: Pick<GitClient, 'currentHead' | 'diffNameOnly' | 'sync'>;
  codeIndex: CodeIndex;
  jobs: Pick<JobScheduler, 'register'>;
  /** Global REPO_INTEL_ENABLED flag; off → every read degrades to empty. */
  enabled: boolean;
}
