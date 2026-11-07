import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiff } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

/**
 * Smart Diff module — deterministic role grouping of a PR's files (no model, no GitHub call).
 *   GET /pulls/:id/smart-diff → SmartDiff (404 when the PR is not in the caller's workspace)
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SmartDiffService(app.container);

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiff } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.forPull(workspaceId, req.params.id);
    },
  );
}
