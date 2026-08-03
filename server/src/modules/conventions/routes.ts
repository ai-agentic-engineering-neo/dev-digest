import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateSkillFromConventionsRequest } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsRepository } from './repository.js';
import { ConventionsService } from './service.js';
import { getConventionsSampleSet } from './samples.js';

/**
 * Conventions module — scan a repo, propose candidate coding rules with real
 * evidence, accept/reject, and merge accepted ones into a skill.
 *
 *   POST /repos/:id/conventions/extract        run a new scan
 *   GET  /repos/:id/conventions                latest scan + its candidates
 *   PUT  /repos/:id/conventions/:conventionId  accept / reject one candidate
 *   POST /repos/:id/conventions/skill          merge ACCEPTED candidates into a skill
 */

const ConventionIdParams = z.object({
  id: z.string().uuid(),
  conventionId: z.string().uuid(),
});

const SetStatusBody = z.object({ status: z.enum(['accepted', 'rejected']) });

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const conventionsRepo = new ConventionsRepository(container.db);
  const service = new ConventionsService(
    conventionsRepo,
    container.repoRepo,
    container.skillsService,
    (repo) => getConventionsSampleSet(container, repo),
    (workspaceId, id) => container.resolveFeatureModel(workspaceId, id),
    (id) => container.llm(id),
  );

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.put(
    '/repos/:id/conventions/:conventionId',
    { schema: { params: ConventionIdParams, body: SetStatusBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.setStatus(
        workspaceId,
        req.params.conventionId,
        req.body.status,
      );
      if (!candidate) throw new NotFoundError('Convention candidate not found');
      return candidate;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillFromConventionsRequest } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkillFromConventions(workspaceId, {
        conventionIds: req.body.convention_ids,
        name: req.body.name,
        description: req.body.description,
        enabled: req.body.enabled,
        ...(req.body.body !== undefined ? { body: req.body.body } : {}),
      });
      reply.status(201);
      return skill;
    },
  );
}
