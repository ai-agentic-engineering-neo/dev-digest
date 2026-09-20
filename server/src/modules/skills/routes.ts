import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Skill, SkillImportPreview, SkillStats, SkillStatsSummary, SkillImportRequest, SkillInput, SkillUpdate } from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * Skills module.
 *   GET    /skills                 → list (workspace-scoped)
 *   POST   /skills                 → create (manual, or the confirm step of an import)
 *   GET    /skills/stats           → SkillStatsSummary[] for every skill (list footers, last 30d)
 *   GET    /skills/:id             → one skill
 *   GET    /skills/:id/stats       → SkillStats for the Stats tab (404 when unknown)
 *   PUT    /skills/:id             → update fields / `enabled` (a body change bumps `version`)
 *   DELETE /skills/:id             → delete (agent links cascade)
 *   POST   /skills/import/preview  → parse a .md/.zip into a preview; STORES NOTHING
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', { schema: { response: { 200: z.array(Skill) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post(
    '/skills',
    { schema: { body: SkillInput, response: { 201: Skill } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.create(workspaceId, req.body);
      return reply.status(201).send(skill);
    },
  );

  app.post(
    '/skills/import/preview',
    {
      schema: { body: SkillImportRequest, response: { 200: SkillImportPreview } },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body);
    },
  );

  app.get(
    '/skills/stats',
    { schema: { response: { 200: z.array(SkillStatsSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.statsSummary(workspaceId);
    },
  );

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, response: { 200: SkillStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.stats(workspaceId, req.params.id);
      if (!stats) throw new NotFoundError('Skill not found');
      return stats;
    },
  );

  app.get(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.get(workspaceId, req.params.id);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: SkillUpdate, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const removed = await service.remove(workspaceId, req.params.id);
    if (!removed) throw new NotFoundError('Skill not found');
    return reply.status(204).send();
  });
}
