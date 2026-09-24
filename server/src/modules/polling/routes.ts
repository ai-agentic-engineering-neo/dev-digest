import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

const PollResponse = z.object({ synced: z.number().int(), reviewTriggered: z.boolean() });

/**
 * F1 — polling module (http).
 *   POST /repos/:id/poll → sync the PR list from GitHub, bump last_polled_at.
 * Never triggers a review.
 */
export default async function pollingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post(
    '/repos/:id/poll',
    { schema: { params: IdParams, response: { 200: PollResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.modules.polling.service.poll(workspaceId, req.params.id);
    },
  );
}
