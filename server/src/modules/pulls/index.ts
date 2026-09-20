import type { Container } from '../../platform/container.js';
import { PullsRepository } from './repository.js';
import { PullsService } from './service.js';

export { PullsService } from './service.js';
export type { PullsServiceDeps, Logger } from './service.js';
export type { PullsRepo, RepoRef, PullRecord } from './types.js';

/**
 * Public factory — the only way another module (`polling/`) may construct a
 * `PullsService`. `PullsRepository` stays a pulls-module internal; per the
 * onion-architecture `no-cross-module` rule, cross-module access goes through
 * `index.ts`/`types.ts` only.
 */
export function createPullsService(container: Container): PullsService {
  return new PullsService({
    repo: new PullsRepository(container.db),
    github: () => container.github(),
  });
}
