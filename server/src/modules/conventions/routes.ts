import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionPatch } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

/**
 * Conventions extractor module.
 *   GET    /repos/:id/conventions          → list + last-scan metadata
 *   POST   /repos/:id/conventions/extract  → sample, ground, persist pending
 *   PATCH  /repos/:id/conventions/:cid     → status and/or rule
 */

const ConventionParams = z.object({
  id: z.string().uuid(),
  cid: z.string().uuid(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams, body: z.object({}).nullish() } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/repos/:id/conventions/:cid',
    { schema: { params: ConventionParams, body: ConventionPatch } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.patch(workspaceId, req.params.id, req.params.cid, req.body);
    },
  );
}
