import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { RequestContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import type { PollingService } from '../application/polling.service.js';

export interface PollingRouteDeps {
  service: PollingService;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

/**
 * F1 — polling. MANUAL refresh that only syncs the PR list; no review is triggered.
 *   POST /repos/:id/poll → sync PR list from GitHub, bump last_polled_at
 */
export async function registerPollingRoutes(
  appBase: FastifyInstance,
  { service, context }: PollingRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.post('/repos/:id/poll', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return service.poll(workspaceId, req.params.id);
  });
}
