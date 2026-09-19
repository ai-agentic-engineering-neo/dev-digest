import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { DEFAULT_STATS_WINDOW_DAYS, MAX_VERSION_MESSAGE_LENGTH, SKILL_NAME_PATTERN } from './constants.js';

/**
 * Skills module (specs/02-skills.md §7.1).
 *   GET    /skills                       → list (workspace-scoped, + used_by)
 *   GET    /skills/:id                   → one skill
 *   POST   /skills                       → create · 409 on a duplicate name
 *   PUT    /skills/:id                   → update / restore-forward / toggle enabled
 *   DELETE /skills/:id                   → hard delete (cascades)
 *   GET    /skills/:id/versions          → version history, newest first
 *   GET    /skills/:id/versions/:version → one version snapshot
 *   GET    /skills/:id/stats?days=30     → run-level stats (§7.2)
 *   GET    /skills/:id/agents            → agents linking this skill (delete confirmation)
 *   POST   /skills/import                → parse a .md/.zip upload — writes nothing
 *
 * A cross-workspace id is a 404, matching the rest of the API. Every handler
 * resolves `workspaceId` via `getContext()` first.
 */

const SkillName = z
  .string()
  .regex(SKILL_NAME_PATTERN, 'name must be a lowercase slug, e.g. pr-quality-rubric');

const CreateSkillBody = z.object({
  name: SkillName,
  description: z.string().min(1),
  type: SkillType,
  body: z.string().min(1),
  source: SkillSource.optional(),
  enabled: z.boolean().optional(),
});

/**
 * `version_message` carries the author's note for a body/name/description/type
 * edit. `restore_from_version` is how "Restore" (Versions tab) is exposed here:
 * it loads that version's body and writes it FORWARD as a new version labelled
 * "Restored from vN" — any `body` given in the same request is ignored.
 */
const UpdateSkillBody = z.object({
  name: SkillName.optional(),
  description: z.string().min(1).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  version_message: z.string().max(MAX_VERSION_MESSAGE_LENGTH).optional(),
  restore_from_version: z.coerce.number().int().positive().optional(),
});

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const StatsQuery = z.object({
  days: z.coerce.number().int().positive().optional(),
});

const ImportBody = z.object({
  filename: z.string().min(1),
  content_b64: z.string().min(1),
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

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, querystring: StatsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const days = req.query.days ?? DEFAULT_STATS_WINDOW_DAYS;
      const stats = await service.stats(workspaceId, req.params.id, days);
      if (!stats) throw new NotFoundError('Skill not found');
      return stats;
    },
  );

  app.get('/skills/:id/agents', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agents = await service.agentsUsing(workspaceId, req.params.id);
    if (!agents) throw new NotFoundError('Skill not found');
    return agents;
  });

  app.post('/skills/import', { schema: { body: ImportBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.importPreview(workspaceId, req.body.filename, req.body.content_b64);
  });
}
