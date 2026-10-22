import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateSkillFromConventionsRequest, SetConventionStatus } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

const ConventionIdParams = z.object({
  id: z.string().uuid(),
  conventionId: z.string().uuid(),
});

/**
 * L02 — conventions module. Transport only; logic lives in ConventionsService.
 *   POST /repos/:id/conventions/extract        → run a new scan (one LLM call)
 *   GET  /repos/:id/conventions                → latest scan + its candidates
 *   PUT  /repos/:id/conventions/:conventionId  → accept / reject one candidate
 *   POST /repos/:id/conventions/skill          → merge ACCEPTED candidates into a skill
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.put(
    '/repos/:id/conventions/:conventionId',
    { schema: { params: ConventionIdParams, body: SetConventionStatus } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setStatus(workspaceId, req.params.id, req.params.conventionId, req.body.status);
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillFromConventionsRequest } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skill;
    },
  );
}
