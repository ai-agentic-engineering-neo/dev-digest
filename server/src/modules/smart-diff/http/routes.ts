import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import { SmartDiffResponse } from './schemas.js';

/**
 * smart-diff module (server/specs/06-smart-diff.md).
 *   GET /pulls/:id/smart-diff → SmartDiff (files grouped by role + the newest
 *   review's finding lines). No model call; a PR from another workspace is a 404.
 */
export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { service } = app.container.modules.smartDiff;

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
