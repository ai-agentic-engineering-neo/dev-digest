import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillImportRequest, SkillInput, SkillPatch } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IMPORT_BODY_LIMIT } from './constants.js';
import { SkillsService } from './service.js';

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/**
 * L02 — skills module. Transport only; logic lives in SkillsService.
 *   GET    /skills                                → list (+ agent_count)
 *   GET    /skills/:id                            → one skill
 *   POST   /skills                                → create (v1)
 *   PUT    /skills/:id                            → update; changed body → new version
 *   DELETE /skills/:id                            → delete (versions + links cascade)
 *   GET    /skills/:id/versions                   → body history (newest first)
 *   POST   /skills/:id/versions/:version/restore  → restore as a new version
 *   GET    /skills/:id/preview                    → block the agent receives + tokens
 *   POST   /skills/import/preview                 → parse .md / .zip upload (persists nothing)
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/skills', { schema: { body: SkillInput } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: SkillPatch } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.update(workspaceId, req.params.id, req.body);
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.delete(workspaceId, req.params.id);
    return { ok: true };
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listVersions(workspaceId, req.params.id);
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.restoreVersion(workspaceId, req.params.id, req.params.version);
    },
  );

  app.get('/skills/:id/preview', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.preview(workspaceId, req.params.id);
  });

  app.post(
    '/skills/import/preview',
    { schema: { body: SkillImportRequest }, bodyLimit: IMPORT_BODY_LIMIT },
    async (req) => {
      await getContext(app.container, req);
      return service.importPreview(req.body.filename, req.body.content_base64);
    },
  );
}
