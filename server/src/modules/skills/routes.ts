import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * Skills library module.
 *   GET    /skills       → list (workspace-scoped)
 *   GET    /skills/:id   → one skill
 *   POST   /skills       → create (source = manual)
 *   PUT    /skills/:id   → update / toggle enabled (versions body on config change)
 *   DELETE /skills/:id   → delete (versions + agent_skills cascade)
 *   GET    /skills/:id/versions          → snapshots (newest first)
 *   GET    /skills/:id/versions/:version → one snapshot
 *   POST   /skills/:id/versions/:version/restore → copy body forward as a new version
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  note: z.string().min(1).nullish(),
});

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  note: z.string().min(1).nullish(),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
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

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

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

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!version) throw new NotFoundError('Skill version not found');
      return version;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );
}
