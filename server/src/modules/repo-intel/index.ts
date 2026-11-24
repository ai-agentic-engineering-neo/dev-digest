import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { registerRepoIntelRoutes } from './http/routes.js';

/**
 * repo-intel: the codebase indexer and its read facade (see README.md).
 * Other modules read through `container.repoIntel` (the RepoIntel interface in
 * types.ts); the barrel below re-exports the contract for them.
 */
export * from './types.js';
export * from './constants.js';
export * from './service.js';
export * from './repository.js';

/**
 * Module factory: registers the INDEX / REFRESH / RESYNC job handlers once at
 * boot (repos enqueues INDEX/REFRESH after clone/refresh) and the HTTP routes.
 */
export default async function repoIntelModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  c.repoIntelService.registerIndexJobHandlers();
  await registerRepoIntelRoutes(app, {
    repoIntel: c.repoIntel,
    jobs: c.jobs,
    context: (req) => getContext(c, req),
  });
}
