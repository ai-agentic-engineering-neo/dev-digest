import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { GENERATE_RATE_LIMIT } from './constants.js';
import { PrBriefResponseSchema } from './schemas.js';

/**
 * Brief module — PR Why + Risk Brief (one model call over precomputed facts).
 *   GET  /pulls/:id/brief   → stored brief or null (never resolves a provider)
 *   POST /pulls/:id/brief   → generate now; concurrent requests share one call; rate-limited
 * Every handler passes the workspace to the service, which 404s for another workspace's PR.
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Shared instance from the container: the single-flight map lives in the service.
  const service = app.container.brief;

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponseSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponseSchema } },
      config: { rateLimit: GENERATE_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.generate(workspaceId, req.params.id, req.log);
    },
  );
}
