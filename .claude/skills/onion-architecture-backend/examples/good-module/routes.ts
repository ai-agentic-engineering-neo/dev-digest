/**
 * skills — HTTP driving adapter (ring 3b).
 *
 *   GET  /skills            → list (workspace-scoped)
 *   GET  /skills/:id        → one skill
 *   POST /skills            → create
 *   PUT  /skills/:id/body   → replace body (new version when it changed)
 *
 * Validation is the Zod route schema; every handler resolves `getContext`
 * first and then calls the service. No Drizzle, no repository import.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MAX_BODY_CHARS, SKILL_TYPES } from './constants.js';
import { SkillsService } from './service.js';

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  type: z.enum(SKILL_TYPES),
  body: z.string().min(1).max(MAX_BODY_CHARS),
});

const UpdateBodyBody = z.object({ body: z.string().min(1).max(MAX_BODY_CHARS) });

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  // Composition: the container owns the repository; the service gets only what it needs.
  const service = new SkillsService({ repo: app.container.skillsRepo });

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    reply.code(201);
    return service.create(workspaceId, req.body);
  });

  app.put('/skills/:id/body', { schema: { params: IdParams, body: UpdateBodyBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.updateBody(workspaceId, req.params.id, req.body.body);
  });
}
