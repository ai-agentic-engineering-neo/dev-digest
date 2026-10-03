import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { SkillSource, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsService } from './service.js';
import { parseArchive, parseMarkdown } from './import.js';

/**
 * Skills module.
 *   GET    /skills                → list (workspace-scoped)
 *   GET    /skills/:id            → one skill
 *   POST   /skills                → create (also the "Confirm" step after import)
 *   PUT    /skills/:id            → update / toggle enabled (versions body)
 *   DELETE /skills/:id            → delete
 *   GET    /skills/:id/versions   → body-snapshot history (newest first)
 *   POST   /skills/import         → parse an uploaded file into a PREVIEW —
 *                                    never writes to the DB; the client then
 *                                    calls POST /skills to confirm it.
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  source: SkillSource,
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

const ImportSkillBody = z.object({
  filename: z.string().min(1),
  content_base64: z.string().min(1),
});

/** Extensions this route knows how to parse, mapped to a dispatch tag. */
function importKindFor(filename: string): 'markdown' | 'archive' | undefined {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.zip')) return 'archive';
  return undefined;
}

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
      type: body.type,
      body: body.body,
      source: body.source,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    });
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

  // ---- Import preview (never writes to the DB) -----------------------------
  // Untrusted input: `content_base64` is attacker-controlled bytes. Dispatch
  // is by filename extension only; the actual parsing (and, for archives, the
  // guarantee that only SKILL.md's content is ever read) lives in import.ts.
  app.post('/skills/import', { schema: { body: ImportSkillBody } }, async (req) => {
    const { filename, content_base64 } = req.body;
    const kind = importKindFor(filename);
    if (!kind) {
      throw new ValidationError(
        `Unsupported file type for import: "${filename}" (expected .md, .markdown, or .zip)`,
      );
    }

    const buffer = Buffer.from(content_base64, 'base64');

    try {
      const parsed =
        kind === 'markdown'
          ? { ...parseMarkdown(buffer.toString('utf8')), evidence_files: [] as string[] }
          : parseArchive(new Uint8Array(buffer));

      return {
        name: parsed.name,
        description: parsed.description,
        type: 'custom' as const,
        body: parsed.body,
        source: 'imported_url' as const,
        evidence_files: parsed.evidence_files,
      };
    } catch (err) {
      throw new ValidationError(err instanceof Error ? err.message : 'Failed to parse import');
    }
  });
}
