import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConfirmSkillImportInput,
  CreateSkillInput,
  UpdateSkillInput,
  type Skill,
  type SkillImportPreview,
  type SkillPreviewBlock,
  type SkillStats,
  type SkillVersion,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { FflateArchiveReader } from '../../adapters/archive/index.js';
import { IMPORT_BODY_LIMIT } from './constants.js';
import { SkillsRepository } from './repository.js';
import { SkillsService } from './service.js';

/**
 * M2 — skills module. Transport only: validates and delegates to SkillsService.
 *   GET    /skills                          → list (+ card stats)
 *   POST   /skills                          → create (v1)
 *   GET    /skills/:id                      → one skill
 *   PUT    /skills/:id                      → edit (body change → new version)
 *   DELETE /skills/:id                      → delete (unlinks from agents)
 *   GET    /skills/:id/preview              → block as the agent receives it + tokens
 *   GET    /skills/:id/stats                → usage stats (30d)
 *   GET    /skills/:id/versions             → history (newest first)
 *   GET    /skills/:id/versions/:version    → one version with body (Diff)
 *   POST   /skills/:id/versions/:version/restore → new version with that body
 *   POST   /skills/import/preview           → parse .md/.zip; saves NOTHING
 *   POST   /skills/import                   → save a reviewed + trusted preview
 */

const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/** Upload as base64 JSON so the body is zod-validated like every other route. */
const ImportPreviewBody = z.object({
  file_name: z
    .string()
    .min(1)
    .max(255)
    .regex(/\.(md|zip)$/i, 'Only .md and .zip files can be imported'),
  content_base64: z.string().min(1).max(IMPORT_BODY_LIMIT),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Module-local composition root: the service only sees narrow ports.
  const service = new SkillsService({
    skills: new SkillsRepository(container.db),
    archive: new FflateArchiveReader(),
    tokenizer: container.tokenizer,
  });

  app.get('/skills', async (req): Promise<Skill[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.post(
    '/skills',
    { schema: { body: CreateSkillInput } },
    async (req, reply): Promise<Skill> => {
      const { workspaceId } = await getContext(container, req);
      reply.status(201);
      return service.create(workspaceId, req.body);
    },
  );

  app.post(
    '/skills/import/preview',
    { bodyLimit: IMPORT_BODY_LIMIT, schema: { body: ImportPreviewBody } },
    async (req): Promise<SkillImportPreview> => {
      await getContext(container, req);
      const data = Buffer.from(req.body.content_base64, 'base64');
      return service.importPreview(req.body.file_name, new Uint8Array(data));
    },
  );

  app.post(
    '/skills/import',
    { schema: { body: ConfirmSkillImportInput } },
    async (req, reply): Promise<Skill> => {
      const { workspaceId } = await getContext(container, req);
      reply.status(201);
      return service.confirmImport(workspaceId, req.body);
    },
  );

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req): Promise<Skill> => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillInput } },
    async (req): Promise<Skill> => {
      const { workspaceId } = await getContext(container, req);
      return service.update(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(container, req);
    await service.delete(workspaceId, req.params.id);
    reply.status(204).send();
  });

  app.get(
    '/skills/:id/preview',
    { schema: { params: IdParams } },
    async (req): Promise<SkillPreviewBlock> => {
      const { workspaceId } = await getContext(container, req);
      return service.preview(workspaceId, req.params.id);
    },
  );

  app.get('/skills/:id/stats', { schema: { params: IdParams } }, async (req): Promise<SkillStats> => {
    const { workspaceId } = await getContext(container, req);
    return service.stats(workspaceId, req.params.id);
  });

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams } },
    async (req): Promise<SkillVersion[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.versions(workspaceId, req.params.id);
    },
  );

  app.get(
    '/skills/:id/versions/:version',
    { schema: { params: VersionParams } },
    async (req): Promise<SkillVersion> => {
      const { workspaceId } = await getContext(container, req);
      return service.version(workspaceId, req.params.id, req.params.version);
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: VersionParams } },
    async (req): Promise<Skill> => {
      const { workspaceId } = await getContext(container, req);
      return service.restore(workspaceId, req.params.id, req.params.version);
    },
  );
}
