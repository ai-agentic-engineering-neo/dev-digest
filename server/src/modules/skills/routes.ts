import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { MAX_BODY_CHARS, MAX_UPLOAD_BYTES } from './constants.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

/**
 * Skills module — the reusable instruction blocks agents load.
 *   GET    /skills                        → list (workspace-scoped, + agent_count)
 *   GET    /skills/:id                    → one skill
 *   POST   /skills                        → create (manual)
 *   PUT    /skills/:id                    → update; a body change bumps version
 *   DELETE /skills/:id                    → delete (agent links cascade)
 *   GET    /skills/:id/versions           → body history (newest first)
 *   GET    /skills/:id/versions/:version  → one snapshot
 *   POST   /skills/:id/versions/:version/restore → snapshot body → new version
 *   GET    /skills/:id/agents             → agents that link this skill
 *   GET    /skills/community              → bundled catalog (no network call)
 *   POST   /skills/import/preview         → preview an upload / catalog entry
 *   POST   /skills/import                 → persist a CONFIRMED preview
 *
 * Route order matters: `/skills/community` is declared before `/skills/:id`
 * would otherwise be a candidate — Fastify's radix router prefers the static
 * segment, but keeping them adjacent makes that explicit rather than lucky.
 */

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).default(''),
  type: SkillType.default('custom'),
  body: z.string().min(1).max(MAX_BODY_CHARS),
  enabled: z.boolean().optional(),
  note: z.string().max(200).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(500).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).max(MAX_BODY_CHARS).optional(),
  enabled: z.boolean().optional(),
  note: z.string().max(200).optional(),
});

/**
 * A preview request is EITHER an upload or a catalog id, never both. Both
 * branches are `.strict()`: without it the union is not exclusive, and a body
 * carrying an upload AND a `community_id` would match the first branch, drop
 * the id, and preview something the caller did not ask for.
 */
const ImportPreviewBody = z.union([
  z
    .object({
      filename: z.string().min(1).max(255),
      content_base64: z.string().min(1),
    })
    .strict(),
  z.object({ community_id: z.string().min(1) }).strict(),
]);

/**
 * What the user confirmed. The body is sent back verbatim rather than held in
 * server state: the text that gets stored is exactly the text the preview
 * showed (and the user may have edited it before confirming).
 */
const ImportCommitBody = z.object({
  name: z.string().min(1).max(64),
  description: z.string().max(500).default(''),
  type: SkillType.default('custom'),
  source: z.enum(['imported_url', 'community']).default('imported_url'),
  body: z.string().min(1).max(MAX_BODY_CHARS),
});

const CommunityQuery = z.object({
  q: z.string().optional(),
  lang: z.string().optional(),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get('/skills/community', { schema: { querystring: CommunityQuery } }, async (req) => {
    await getContext(app.container, req);
    return service.searchCommunity(req.query.q, req.query.lang);
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

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.restoreVersion(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill version not found');
      return skill;
    },
  );

  app.get('/skills/:id/agents', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const agents = await service.agentsUsing(workspaceId, req.params.id);
    if (!agents) throw new NotFoundError('Skill not found');
    return agents;
  });

  // The app's global bodyLimit is 1 MB, and base64 inflates an upload by ~4/3,
  // so without a route-level limit a file well under MAX_UPLOAD_BYTES dies as a
  // raw 413 before the handler can answer with the module's own 422.
  const IMPORT_BODY_LIMIT = Math.ceil(MAX_UPLOAD_BYTES * 1.4);

  app.post(
    '/skills/import/preview',
    { bodyLimit: IMPORT_BODY_LIMIT, schema: { body: ImportPreviewBody } },
    async (req) => {
      await getContext(app.container, req);
      // Deliberately NOT persisted: this is the step that makes "saved only
      // after confirmation" true rather than a claim in the UI copy.
      return service.previewImport(req.body);
    },
  );

  app.post(
    '/skills/import',
    { bodyLimit: IMPORT_BODY_LIMIT, schema: { body: ImportCommitBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.importSkill(workspaceId, req.body);
      reply.status(201);
      return skill;
    },
  );
}
