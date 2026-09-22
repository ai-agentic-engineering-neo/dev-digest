import type { Container } from '../../platform/container.js';
import type { JobHandlers } from '../../platform/jobs.js';
import { RepoService, type CloneJobPayload } from './service.js';
import { RepoRepository } from './repository.js';
import { CLONE_JOB_KIND } from './constants.js';

/**
 * Composition root of the repos module (lazy: `Container.modules.repos`).
 * `jobs` are registered on the JobRunner once at boot by the Container. `git`
 * is read through a getter so the container's lazy client (and test
 * overrides) apply at call time.
 */
export function buildReposModule(c: Container) {
  const service = new RepoService({
    repos: new RepoRepository(c.db),
    git: {
      clone: (repo, url, opts) => c.git.clone(repo, url, opts),
    },
    jobs: c.jobs,
  });
  const jobs: JobHandlers = {
    [CLONE_JOB_KIND]: (payload, { signal }) => service.runCloneJob(payload as CloneJobPayload, { signal }),
  };
  return { service, jobs };
}
