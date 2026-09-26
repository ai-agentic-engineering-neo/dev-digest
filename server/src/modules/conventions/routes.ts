import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

const PatchConventionBody = z.object({
  status: ConventionStatus.optional(),
  rule: z.string().min(1).optional(),
  category: z.string().optional(),
});

const CreateConventionsSkillBody = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  enabled: z.boolean(),
  body: z.string().min(1),
  replace_skill_id: z.string().uuid().optional(),
});

/**
 * Conventions module (server/specs/conventions.md, C1-C10).
 *   POST /repos/:id/conventions/extract        -> run C1-C6, returns ConventionList + {dropped}
 *   GET  /repos/:id/conventions                 -> latest scan + non-rejected candidates
 *   PATCH /conventions/:id                      -> {status?, rule?, category?} (evidence is immutable)
 *   POST /repos/:id/conventions/skill/preview   -> preview only, writes nothing
 *   POST /repos/:id/conventions/skill           -> create or replace_skill_id update (C7/C8)
 */
export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const result = await service.extract(workspaceId, req.params.id);
    if (!result) throw new NotFoundError('Repo not found');
    return { ...result.list, dropped: result.dropped };
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const list = await service.get(workspaceId, req.params.id);
    if (!list) throw new NotFoundError('Repo not found');
    return list;
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.patchCandidate(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention candidate not found');
      return candidate;
    },
  );

  app.post(
    '/repos/:id/conventions/skill/preview',
    { schema: { params: IdParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const preview = await service.previewSkill(workspaceId, req.params.id);
      if (!preview) throw new NotFoundError('Repo not found');
      return preview;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateConventionsSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.createSkill(workspaceId, req.params.id, req.body);
      if (!result) throw new NotFoundError('Repo not found');
      reply.status(201);
      return result;
    },
  );
}
