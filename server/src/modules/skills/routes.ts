import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { SkillImportError } from './import.js';

/** `/skills/:id/versions/:v` — id is a uuid, v a positive integer version. */
const VersionParams = z.object({
  id: z.string().uuid(),
  v: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  body: z.string().min(1),
  source: SkillSource.optional(),
  note: z.string().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  note: z.string().optional(),
});

const TokensBody = z.object({ text: z.string() });

const ImportPreviewBody = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
});

/**
 * A1 — skills module.
 *   GET    /skills                          -> list (workspace-scoped) + agent_count/pull_rate/accept_rate
 *   GET    /skills/:id                      -> one skill
 *   POST   /skills                          -> create (S6: source=imported_file forces enabled:false)
 *   PUT    /skills/:id                      -> update (S4: config change bumps version)
 *   DELETE /skills/:id                      -> delete (agent_skills cascades via FK)
 *   GET    /skills/:id/versions             -> version history (newest first)
 *   GET    /skills/:id/versions/:v          -> one version snapshot
 *   POST   /skills/:id/versions/:v/restore  -> S5 restore (a normal save)
 *   GET    /skills/:id/stats                -> S10 usage stats
 *   POST   /skills/tokens                   -> token count for the editor
 *   POST   /skills/import/preview           -> S6 parse-only preview, writes nothing
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

  app.get('/skills/:id/versions/:v', { schema: { params: VersionParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const version = await service.getVersion(workspaceId, req.params.id, req.params.v);
    if (!version) throw new NotFoundError('Skill version not found');
    return version;
  });

  app.post(
    '/skills/:id/versions/:v/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.params.v);
      if (!skill) throw new NotFoundError('Skill or version not found');
      return skill;
    },
  );

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const stats = await service.stats(workspaceId, req.params.id);
    if (!stats) throw new NotFoundError('Skill not found');
    return stats;
  });

  app.post('/skills/tokens', { schema: { body: TokensBody } }, async (req) => {
    await getContext(app.container, req);
    return { tokens: service.tokens(req.body.text) };
  });

  app.post('/skills/import/preview', { schema: { body: ImportPreviewBody } }, async (req) => {
    await getContext(app.container, req);
    try {
      return service.previewImport(req.body.filename, req.body.content_base64);
    } catch (err) {
      if (err instanceof SkillImportError) throw new ValidationError(err.message);
      throw err;
    }
  });
}
