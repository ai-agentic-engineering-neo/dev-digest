import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { IMPORT_BODY_LIMIT } from './constants.js';
import { SkillsService } from './service.js';

/**
 * Skills module — reusable, text-only prompt blocks linked to agents.
 *   GET    /skills                  → list (workspace-scoped)
 *   GET    /skills/usage            → { [skillId]: linkedAgentCount }
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (manual, trusted)
 *   PUT    /skills/:id              → update / toggle enabled (content edits bump version)
 *   DELETE /skills/:id              → delete (agent links cascade)
 *   GET    /skills/:id/versions     → body history (newest first)
 *   POST   /skills/import/preview   → parse a .md / .zip upload → preview (nothing saved)
 *   POST   /skills/import           → confirm: re-parse + save as untrusted `community`
 * Linking to agents lives in the agents module: POST /agents/:id/skills.
 */

const Name = z.string().trim().min(1).max(64);
const Description = z.string().trim().min(1).max(1000);

const CreateSkillBody = z.object({
  name: Name,
  description: Description,
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z
  .object({
    name: Name.optional(),
    description: Description.optional(),
    type: SkillType.optional(),
    body: z.string().min(1).optional(),
    enabled: z.boolean().optional(),
  })
  // An empty patch would reach Drizzle's `.set({})` and fail as a 500 → reject it as a 422.
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: 'Provide at least one field to update',
  });

const Upload = z.object({
  filename: z.string().trim().min(1).max(255),
  content_base64: z.string().min(1),
});

const ImportBody = Upload.extend({
  name: Name.optional(),
  description: Description.optional(),
  type: SkillType.optional(),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/usage', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.usage(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.update(workspaceId, req.params.id, req.body);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const versions = await service.versions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/import/preview',
    { schema: { body: Upload }, bodyLimit: IMPORT_BODY_LIMIT },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body.filename, req.body.content_base64);
    },
  );

  app.post(
    '/skills/import',
    { schema: { body: ImportBody }, bodyLimit: IMPORT_BODY_LIMIT },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.importSkill(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );
}
