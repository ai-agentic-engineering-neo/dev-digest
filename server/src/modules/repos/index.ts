import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { ReposService } from './application/repos.service.js';
import { registerReposRoutes } from './http/routes.js';
import { DrizzleReposRepository } from './infrastructure/repos.repository.js';

/** Repos module factory — also registers the `clone` job handler. */
export default async function reposModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  const service = new ReposService({
    repos: new DrizzleReposRepository(c.db),
    jobs: c.jobs,
    git: () => c.git,
    now: () => new Date(),
  });
  service.registerCloneJobHandler();
  await registerReposRoutes(app, { service, context: (req) => getContext(c, req) });
}
