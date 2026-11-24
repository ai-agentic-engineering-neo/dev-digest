import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SkillCreate, SkillImportRequest, SkillUpdate } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/**
 * Skills module.
 *   GET    /skills                  → list (with agent_count)
 *   POST   /skills                  → create
 *   GET    /skills/:id              → one skill
 *   PUT    /skills/:id              → update (bumps version only on body change)
 *   DELETE /skills/:id              → delete
 *   GET    /skills/:id/versions     → body history (newest first)
 *   POST   /skills/:id/versions/:version/restore → new version with that body (history is kept)
 *   POST   /skills/import/preview   → parse an uploaded .md/.zip; saves nothing
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post('/skills', { schema: { body: SkillCreate } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  // Registered before /skills/:id; find-my-way prefers the static segment anyway.
  app.post(
    '/skills/import/preview',
    {
      schema: { body: SkillImportRequest },
      bodyLimit: 2_097_152,
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      await getContext(app.container, req);
      return service.previewImport(req.body.filename, req.body.content_base64);
    },
  );

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError('Skill not found');
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: SkillUpdate } }, async (req) => {
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
    const versions = await service.listVersions(workspaceId, req.params.id);
    if (!versions) throw new NotFoundError('Skill not found');
    return versions;
  });

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.restoreVersion(workspaceId, req.params.id, req.params.version);
    },
  );
}
