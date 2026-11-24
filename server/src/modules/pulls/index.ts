import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { PullsService } from './application/pulls.service.js';
import { registerPullsRoutes } from './http/routes.js';
import { DrizzlePullsRepository } from './infrastructure/pulls.repository.js';

/** Pulls module factory. */
export default async function pullsModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  const service = new PullsService({
    pulls: new DrizzlePullsRepository(c.db),
    github: () => c.github(),
    log: app.log,
    now: () => Date.now(),
  });
  await registerPullsRoutes(app, { service, context: (req) => getContext(c, req) });
}
