/**
 * skills — HTTP driving adapter (ring 3b).
 *
 *   GET    /skills          → list (workspace-scoped, by name)
 *   GET    /skills/:id      → one skill
 *   POST   /skills          → create (source is always `manual`)
 *   PUT    /skills/:id      → update metadata and/or body (body change = new version)
 *   DELETE /skills/:id      → delete (agent links cascade)
 *   POST   /skills/import/preview → parse an uploaded .md/.zip into a preview (nothing saved)
 *
 * Validation is the Zod route schema; every handler resolves `getContext`
 * first and then calls the service. No Drizzle, no repository import.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import {
  CREATABLE_SKILL_SOURCES,
  MAX_BODY_CHARS,
  MAX_IMPORT_BYTES,
  MAX_NAME_CHARS,
  SKILL_NAME_PATTERN,
  SKILL_TYPES,
} from './constants.js';
import { SkillsService } from './service.js';

const SkillName = z
  .string()
  .min(1)
  .max(MAX_NAME_CHARS)
  .regex(SKILL_NAME_PATTERN, 'Skill name must be a kebab-case slug, e.g. pr-quality-rubric');

const CreateSkillBody = z.object({
  name: SkillName,
  description: z.string().default(''),
  type: z.enum(SKILL_TYPES),
  body: z.string().min(1).max(MAX_BODY_CHARS),
  enabled: z.boolean().optional(),
  source: z.enum(CREATABLE_SKILL_SOURCES).optional(),
});

/** Upload as JSON: base64 keeps the API multipart-free; the cap covers the 4/3 inflation. */
const ImportPreviewBody = z.object({
  filename: z.string().min(1).max(255),
  content_base64: z.string().min(1).base64(),
});
const IMPORT_BODY_LIMIT = Math.ceil(MAX_IMPORT_BYTES * 1.4) + 1024;

const UpdateSkillBody = z.object({
  name: SkillName.optional(),
  description: z.string().optional(),
  type: z.enum(SKILL_TYPES).optional(),
  body: z.string().min(1).max(MAX_BODY_CHARS).optional(),
  enabled: z.boolean().optional(),
});

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

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.update(workspaceId, req.params.id, req.body);
  });

  app.post(
    '/skills/import/preview',
    { schema: { body: ImportPreviewBody }, bodyLimit: IMPORT_BODY_LIMIT },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body.filename, req.body.content_base64);
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });
}
