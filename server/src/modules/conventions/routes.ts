/**
 * Conventions extractor HTTP module.
 *
 *   GET    /repos/:id/conventions          → ConventionCandidate[]
 *   POST   /repos/:id/conventions/extract  → ConventionExtractResult (one cheap LLM call)
 *   PATCH  /repos/:id/conventions          → select / deselect all
 *   PATCH  /conventions/:id                → edit rule text and/or accepted
 *   DELETE /conventions/:id                → reject (removes the candidate)
 *
 * Turning accepted candidates into a skill reuses `POST /skills`
 * (type `convention`, source `extracted`).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionBulkAccept, ConventionUpdate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/repos/:id/conventions',
    { schema: { params: IdParams, body: ConventionBulkAccept } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setAll(workspaceId, req.params.id, req.body);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionUpdate } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/conventions/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.remove(workspaceId, req.params.id);
    reply.status(204);
  });
}
