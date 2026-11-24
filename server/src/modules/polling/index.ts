import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { PollingService } from './application/polling.service.js';
import { registerPollingRoutes } from './http/routes.js';
import { DrizzlePollingRepository } from './infrastructure/polling.repository.js';

/** Polling module factory. */
export default async function pollingModule(app: FastifyInstance): Promise<void> {
  const c = app.container;
  const service = new PollingService({
    repos: new DrizzlePollingRepository(c.db),
    github: () => c.github(),
    now: () => new Date(),
  });
  await registerPollingRoutes(app, { service, context: (req) => getContext(c, req) });
}
