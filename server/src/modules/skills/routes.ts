import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Skill,
  SkillEnabledInput,
  SkillImportPreview,
  SkillImportRequest,
  SkillInput,
  SkillUpdate,
  SkillVersion,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams, OkResponse } from '../_shared/schemas.js';
import { IMPORT_PREVIEW_BODY_LIMIT } from './constants.js';

/** `/skills/:id/versions/:v` — id is a uuid, v a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  v: z.coerce.number().int().positive(),
});

/**
 * M2 — skills module.
 *   GET    /skills                          → list (oldest first, with agent_count)
 *   GET    /skills/:id                      → one skill, with token_count
 *   POST   /skills                          → create (v1)
 *   PATCH  /skills/:id                      → edit; a content change writes a version
 *   PATCH  /skills/:id/enabled              → toggle the global flag (no version)
 *   DELETE /skills/:id                      → delete (versions + links cascade)
 *   GET    /skills/:id/versions             → history, newest first
 *   GET    /skills/:id/versions/:v          → one version
 *   POST   /skills/:id/versions/:v/restore  → copy v onto the skill as a new version
 *   POST   /skills/import/preview           → parse an upload; writes nothing
 *   POST   /skills/import                   → confirm: save as imported_file
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.skillsService;

  app.get('/skills', { schema: { response: { 200: z.array(Skill) } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams, response: { 200: Skill } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/skills', { schema: { body: SkillInput, response: { 201: Skill } } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.patch(
    '/skills/:id',
    { schema: { params: IdParams, body: SkillUpdate, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.patch(
    '/skills/:id/enabled',
    { schema: { params: IdParams, body: SkillEnabledInput, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setEnabled(workspaceId, req.params.id, req.body.enabled);
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams, response: { 200: OkResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listVersions(workspaceId, req.params.id);
    },
  );

  app.get(
    '/skills/:id/versions/:v',
    { schema: { params: VersionParams, response: { 200: SkillVersion } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getVersion(workspaceId, req.params.id, req.params.v);
    },
  );

  app.post(
    '/skills/:id/versions/:v/restore',
    { schema: { params: VersionParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.restore(workspaceId, req.params.id, req.params.v);
    },
  );

  // base64 makes the body ~4/3 of the file: a 1 MB upload needs more than the
  // global 1 MB bodyLimit. The decoded size is checked again in the service.
  app.post(
    '/skills/import/preview',
    {
      bodyLimit: IMPORT_PREVIEW_BODY_LIMIT,
      schema: { body: SkillImportRequest, response: { 200: SkillImportPreview } },
    },
    async (req) => {
      await getContext(container, req);
      return service.previewImport(req.body);
    },
  );

  app.post('/skills/import', { schema: { body: SkillInput, response: { 201: Skill } } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    const skill = await service.confirmImport(workspaceId, req.body);
    reply.status(201);
    return skill;
  });
}
