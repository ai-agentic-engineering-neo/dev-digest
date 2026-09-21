import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { MAX_SKILL_BODY_CHARS, MAX_SKILL_DESCRIPTION_CHARS } from './constants.js';

/**
 * Skills module — reusable instruction blocks shared across agents.
 *   GET    /skills                  → list (workspace-scoped)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (also the "save" step of an import)
 *   PUT    /skills/:id              → update / toggle enabled (versions the body)
 *   DELETE /skills/:id              → delete (links + versions cascade)
 *   GET    /skills/:id/versions     → body history (newest first)
 *   POST   /skills/import/preview   → parse a document; persists NOTHING
 *   POST   /skills/import/url       → fetch a URL + parse it; persists NOTHING
 *
 * Both import routes are preview-only by design: the client shows the parsed
 * core, the user confirms, and only then does a normal POST /skills store it.
 */

const CreateSkillBody = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(MAX_SKILL_DESCRIPTION_CHARS).default(''),
  type: SkillType,
  body: z.string().min(1).max(MAX_SKILL_BODY_CHARS),
  source: z
    .enum(['manual', 'imported_file', 'imported_url', 'extracted', 'community'])
    .optional(),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(MAX_SKILL_DESCRIPTION_CHARS).optional(),
  type: SkillType.optional(),
  body: z.string().min(1).max(MAX_SKILL_BODY_CHARS).optional(),
  enabled: z.boolean().optional(),
});

/** A document the client already has in hand (a pasted body, an uploaded
 *  file, or the single markdown member it extracted from an archive). */
const ImportPreviewBody = z.object({
  text: z.string().min(1).max(MAX_SKILL_BODY_CHARS),
  /** Filename or archive member path — shown in the preview header. */
  origin: z.string().max(400).optional(),
  source: z.enum(['imported_file', 'imported_url', 'community']).optional(),
  /**
   * Archive members the client deliberately did NOT read (scripts, binaries).
   * Display-only: the server never receives those bytes, which is the point.
   */
  skipped_entries: z.array(z.string().max(400)).max(200).optional(),
});

const ImportUrlBody = z.object({ url: z.string().url().max(2000) });

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
    const body = req.body;
    const skill = await service.create(workspaceId, {
      name: body.name,
      description: body.description,
      type: body.type,
      body: body.body,
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    });
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

  app.post('/skills/import/preview', { schema: { body: ImportPreviewBody } }, async (req) => {
    await getContext(app.container, req);
    const body = req.body;
    return service.preview({
      text: body.text,
      ...(body.origin !== undefined ? { origin: body.origin } : {}),
      ...(body.source !== undefined ? { source: body.source } : {}),
      ...(body.skipped_entries !== undefined ? { skippedEntries: body.skipped_entries } : {}),
    });
  });

  // Tighter limit than the global 120/min: this is the ONE route that makes the
  // server issue an outbound request to an address the caller chose. Capping it
  // keeps the import feature from doubling as a port scanner even if the
  // address guards were ever weakened. (Ignored when the rate-limit plugin is
  // not registered, i.e. under test.)
  app.post(
    '/skills/import/url',
    { schema: { body: ImportUrlBody }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      await getContext(app.container, req);
      return service.previewFromUrl(req.body.url);
    },
  );
}
