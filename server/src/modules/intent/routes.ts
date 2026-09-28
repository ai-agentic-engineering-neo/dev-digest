import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * intent module.
 *   GET  /pulls/:id/intent          → { intent } | { intent: null }; never a model call
 *   POST /pulls/:id/intent/derive   → re-derive (rate-limited: this is a paid model call)
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.intentService;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.getForPull(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent/derive',
    {
      schema: { params: IdParams, response: { 200: PrIntentResponse } },
      config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.derive(workspaceId, req.params.id, req.id);
    },
  );
}
