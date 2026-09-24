import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import { REFRESH_RATE_LIMIT } from '../domain/constants.js';
import { IntentResponseSchema } from './schemas.js';

/**
 * intent module (server/specs/05-intent-layer.md).
 *   GET  /pulls/:id/intent          → PrIntentResponse (null before the first derivation)
 *   POST /pulls/:id/intent/refresh  → forces re-derivation (ignores the cache), rate limited
 * A PR from another workspace is a 404.
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { service } = app.container.modules.intent;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: IntentResponseSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent/refresh',
    {
      schema: { params: IdParams, response: { 200: IntentResponseSchema } },
      config: { rateLimit: REFRESH_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.refresh(workspaceId, req.params.id);
    },
  );
}
