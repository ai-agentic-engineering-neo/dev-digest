import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PollingService } from './service.js';

/**
 * F1 — polling module. Transport layer only.
 *   POST /repos/:id/sync  → sync PR list from GitHub, bump last_polled_at
 */
const PollResponse = z.object({ synced: z.number().int(), reviewTriggered: z.literal(false) });

export default async function pollingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  const service = new PollingService({
    repos: container.repoStore,
    pulls: container.pullStore,
    github: () => container.github(),
  });

  app.post('/repos/:id/sync', { schema: { params: IdParams, response: { 200: PollResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.pollRepo(workspaceId, req.params.id);
  });
}
