import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  Skill,
  SkillCreateBody,
  SkillImportPreview,
  SkillImportRequest,
  SkillStats,
  SkillUpdateBody,
  SkillVersion,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { createSkillsService } from './compose.js';
import { toHttpError } from './http-errors.js';

/** base64 inflates by ~4/3 — the global 1 MB body limit is too tight here. */
const IMPORT_BODY_LIMIT = 1_600_000;

/**
 * L02 — skills module.
 *   GET    /skills                  → list (workspace-scoped, by name)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (manual, or confirmed import)
 *   PUT    /skills/:id              → edit; a body change records a new version
 *   DELETE /skills/:id              → delete (agent links cascade)
 *   GET    /skills/:id/versions     → body history (newest first)
 *   GET    /skills/:id/stats        → Stats tab: linked agents, pull/accept rate, 30-day findings
 *   POST   /skills/import/preview   → parse an uploaded .md/.zip; saves nothing
 */
export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = createSkillsService(app.container);

  app.get('/skills', { schema: { response: { 200: z.array(Skill) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

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

  app.post(
    '/skills',
    { schema: { body: SkillCreateBody, response: { 201: Skill } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      try {
        const skill = await service.create(workspaceId, req.body);
        reply.status(201);
        return skill;
      } catch (err) {
        throw toHttpError(err);
      }
    },
  );

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: SkillUpdateBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      try {
        const skill = await service.update(workspaceId, req.params.id, req.body);
        if (!skill) throw new NotFoundError('Skill not found');
        return skill;
      } catch (err) {
        throw toHttpError(err);
      }
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.delete(workspaceId, req.params.id);
    if (!ok) throw new NotFoundError('Skill not found');
    return { ok: true };
  });

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Skill not found');
      return versions;
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

  app.post(
    '/skills/import/preview',
    {
      bodyLimit: IMPORT_BODY_LIMIT,
      schema: { body: SkillImportRequest, response: { 200: SkillImportPreview } },
    },
    async (req) => {
      await getContext(app.container, req);
      try {
        return service.previewImport(req.body.filename, req.body.content_base64);
      } catch (err) {
        throw toHttpError(err);
      }
    },
  );
}
