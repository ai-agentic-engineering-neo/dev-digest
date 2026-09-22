import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CommunitySkill,
  CreateSkillInput,
  Skill,
  SkillAgentRef,
  SkillImportPreview,
  SkillImportRequest,
  SkillStats,
  SkillStatsSummary,
  SkillVersion,
  UpdateSkillInput,
} from '@devdigest/shared';
import { getContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import { NotFoundError } from '../../../platform/errors.js';
import { IMPORT_MAX_BASE64_CHARS, STATS_DEFAULT_DAYS, STATS_MAX_DAYS } from '../domain/constants.js';

/**
 * Skills module (server/specs/03-skills.md, API table).
 *   GET    /skills                                  → Skill[] (name asc, with used_by)
 *   GET    /skills/stats?days=                      → SkillStatsSummary[] (list cards)
 *   GET    /skills/community?q=&tag=&lang=          → CommunitySkill[] (built-in catalog)
 *   POST   /skills/import/preview                   → SkillImportPreview (persists nothing)
 *   GET    /skills/:id                              → Skill
 *   POST   /skills                                  → 201 Skill (v1 snapshotted)
 *   PUT    /skills/:id                              → Skill (409 stale_version / conflict)
 *   DELETE /skills/:id                              → { ok: true }
 *   GET    /skills/:id/versions                     → SkillVersion[] (newest first)
 *   GET    /skills/:id/versions/:version            → SkillVersion
 *   POST   /skills/:id/versions/:version/restore    → Skill (vK written as vN+1)
 *   GET    /skills/:id/agents                       → SkillAgentRef[]
 *   GET    /skills/:id/stats?days=                  → SkillStats
 * A skill from another workspace is a 404, never a 403.
 */

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});
const DaysQuery = z.object({
  days: z.coerce.number().int().min(1).max(STATS_MAX_DAYS).default(STATS_DEFAULT_DAYS),
});
const CommunityQuery = z.object({
  q: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  lang: z.string().max(50).optional(),
});
const Ok = z.object({ ok: z.literal(true) });

/** Base64 upload (≤ 2 MB) + JSON envelope; Fastify's default limit is 1 MiB. */
const IMPORT_BODY_LIMIT = IMPORT_MAX_BASE64_CHARS + 64 * 1024;

const SKILL_NOT_FOUND = 'Skill not found';

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { service, importer } = app.container.modules.skills;

  app.get('/skills', { schema: { response: { 200: z.array(Skill) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get(
    '/skills/stats',
    { schema: { querystring: DaysQuery, response: { 200: z.array(SkillStatsSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.statsSummary(workspaceId, req.query.days);
    },
  );

  app.get(
    '/skills/community',
    { schema: { querystring: CommunityQuery, response: { 200: z.array(CommunitySkill) } } },
    async (req) => {
      await getContext(app.container, req);
      return importer.community(req.query);
    },
  );

  app.post(
    '/skills/import/preview',
    { bodyLimit: IMPORT_BODY_LIMIT, schema: { body: SkillImportRequest, response: { 200: SkillImportPreview } } },
    async (req) => {
      await getContext(app.container, req);
      return importer.preview(req.body);
    },
  );

  app.get('/skills/:id', { schema: { params: IdParams, response: { 200: Skill } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.get(workspaceId, req.params.id);
    if (!skill) throw new NotFoundError(SKILL_NOT_FOUND);
    return skill;
  });

  app.post('/skills', { schema: { body: CreateSkillInput, response: { 201: Skill } } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillInput, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError(SKILL_NOT_FOUND);
      return skill;
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams, response: { 200: Ok } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    if (!(await service.delete(workspaceId, req.params.id))) throw new NotFoundError(SKILL_NOT_FOUND);
    return { ok: true as const };
  });

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError(SKILL_NOT_FOUND);
      return versions;
    },
  );

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams, response: { 200: SkillVersion } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!version) throw new NotFoundError('Skill version not found');
      return version;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError(SKILL_NOT_FOUND);
      return skill;
    },
  );

  app.get(
    '/skills/:id/agents',
    { schema: { params: IdParams, response: { 200: z.array(SkillAgentRef) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agents = await service.agents(workspaceId, req.params.id);
      if (!agents) throw new NotFoundError(SKILL_NOT_FOUND);
      return agents;
    },
  );

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, querystring: DaysQuery, response: { 200: SkillStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.stats(workspaceId, req.params.id, req.query.days);
      if (!stats) throw new NotFoundError(SKILL_NOT_FOUND);
      return stats;
    },
  );
}
