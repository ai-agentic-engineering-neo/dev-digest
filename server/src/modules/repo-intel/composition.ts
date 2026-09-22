import { cpus } from 'node:os';
import type { Container } from '../../platform/container.js';
import type { JobHandlers } from '../../platform/jobs.js';
import { RepoIntelService } from './service.js';
import type { IndexPayload } from './application/full-index.js';
import type { RepoIntelDeps } from './application/ports.js';
import { RepoIntelRepository } from './infrastructure/repository.js';
import { astGrepSourceAnalyzer, cloneFileSystem } from './infrastructure/source-adapters.js';
import { INDEX_JOB_KIND, REFRESH_JOB_KIND, RESYNC_JOB_KIND } from './constants.js';

/**
 * Composition root of the repo-intel module (lazy: `Container.modules.repoIntel`).
 * Adapters are read through getters so the container's lazy construction (and
 * test overrides) apply at call time. The job handlers always use the REAL
 * service — `ContainerOverrides.repoIntel` only swaps the read facade
 * (`container.repoIntel`). Handlers swallow the IndexResult (JobRunner wants
 * void); status is observable via repo_index_state.
 */
export function buildRepoIntelModule(c: Container) {
  const repository = new RepoIntelRepository(c.db);
  const deps: RepoIntelDeps = {
    enabled: c.config.repoIntelEnabled,
    reader: repository,
    state: repository,
    tx: c.transactionRunner((db) => ({ index: new RepoIntelRepository(db) })),
    get git() {
      return c.git;
    },
    get codeIndex() {
      return c.codeIndex;
    },
    get graph() {
      return c.depgraph;
    },
    get tokenizer() {
      return c.tokenizer;
    },
    analyzer: astGrepSourceAnalyzer,
    files: cloneFileSystem,
    jobs: c.jobs,
    parseConcurrency: Math.max(1, cpus().length - 1),
  };
  const service = new RepoIntelService(deps);
  const jobs: JobHandlers = {
    [INDEX_JOB_KIND]: async (payload) => {
      await service.indexRepo((payload as IndexPayload).repoId);
    },
    [REFRESH_JOB_KIND]: async (payload) => {
      await service.refreshIndex((payload as IndexPayload).repoId);
    },
    [RESYNC_JOB_KIND]: async (payload, { signal }) => {
      await service.resyncRepo((payload as IndexPayload).repoId, { signal });
    },
  };
  return { service, jobs };
}
