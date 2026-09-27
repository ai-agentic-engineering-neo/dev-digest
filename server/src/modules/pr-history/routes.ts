import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PrHistoryService } from './service.js';

/**
 * pr-history module.
 *   GET /pulls/:id/history — prior PRs (same repo) that touched at least one
 *   of this PR's changed files, most-overlapping first. No LLM call.
 */
export default async function prHistoryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new PrHistoryService(container);

  app.get(
    '/pulls/:id/history',
    { schema: { params: IdParams, response: { 200: PrHistory } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.historyForPull(workspaceId, req.params.id);
    },
  );
}
