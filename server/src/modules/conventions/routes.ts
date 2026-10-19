import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConventionCandidate,
  ConventionScan,
  ConventionUpdateBody,
  ConventionsBulkBody,
  ConventionsList,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { createConventionsService } from './compose.js';
import { toHttpError } from './http-errors.js';

/**
 * L02 — conventions extractor.
 *   GET   /repos/:id/conventions           → latest extraction + its candidates
 *   POST  /repos/:id/conventions/extract   → 202, starts an extraction (re-scan replaces all)
 *   PATCH /conventions/:id                 → edit / accept / reject one candidate
 *   POST  /repos/:id/conventions/bulk      → Accept all / Reject all (pending only)
 * Composing accepted candidates into a skill goes through POST /skills
 * (`source: 'extracted'`) and PUT /agents/:id/skills.
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = createConventionsService(app.container, app.log);

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: ConventionsList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const list = await service.list(workspaceId, req.params.id);
      if (!list) throw new NotFoundError('Repo not found');
      return list;
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams, response: { 202: z.object({ scan: ConventionScan }) } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      try {
        const scan = await service.extract(workspaceId, req.params.id);
        if (!scan) throw new NotFoundError('Repo not found');
        reply.status(202);
        return { scan };
      } catch (err) {
        throw toHttpError(err);
      }
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionUpdateBody, response: { 200: ConventionCandidate } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const item = await service.update(workspaceId, req.params.id, req.body);
      if (!item) throw new NotFoundError('Convention not found');
      return item;
    },
  );

  app.post(
    '/repos/:id/conventions/bulk',
    {
      schema: {
        params: IdParams,
        body: ConventionsBulkBody,
        response: { 200: z.object({ updated: z.number().int() }) },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.resolvePending(workspaceId, req.params.id, req.body.status);
      if (updated === undefined) throw new NotFoundError('Repo not found');
      return { updated };
    },
  );
}
