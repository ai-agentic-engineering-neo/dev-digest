import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionStatus, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — Conventions Extractor (Skills Lab).
 *   GET   /repos/:id/conventions              → candidates of the repo
 *   POST  /repos/:id/conventions/extract      → sample (code) → model → ground (code) → store
 *   POST  /repos/:id/conventions/status       → set every candidate's status (select / deselect all)
 *   PATCH /conventions/:id                    → accept / reject / edit the rule
 *   GET   /repos/:id/conventions/skill-draft  → merged `<repo>-conventions` skill draft
 *   POST  /repos/:id/conventions/skill        → save the edited draft (+ optional agent link)
 */

const PatchBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().max(500).optional(),
  })
  .refine((b) => b.status !== undefined || b.rule !== undefined, {
    message: 'Provide status or rule',
  });

const StatusBody = z.object({ status: ConventionStatus });

const CreateSkillBody = z.object({
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().min(1).max(1000),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  agent_id: z.string().uuid().nullish(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/status',
    { schema: { params: IdParams, body: StatusBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.setAll(workspaceId, req.params.id, req.body.status);
    },
  );

  app.patch('/conventions/:id', { schema: { params: IdParams, body: PatchBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.update(workspaceId, req.params.id, req.body);
  });

  app.get('/repos/:id/conventions/skill-draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.skillDraft(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const result = await service.createSkill(workspaceId, req.params.id, req.body);
      reply.status(201);
      return result;
    },
  );
}
