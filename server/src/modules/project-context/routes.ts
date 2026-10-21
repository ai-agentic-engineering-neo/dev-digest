import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ContextAttachment,
  ContextAttachmentsUpdate,
  ContextFileContent,
  ContextFileUpdate,
  SpecFile,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MAX_PATH_CHARS, OVERRIDE_BODY_LIMIT } from './constants.js';

/** `?refresh=true` only: a plain z.coerce.boolean would read "false" as true. */
const BoolQuery = z.enum(['true', 'false']).optional();

const ListQuery = z.object({ refresh: BoolQuery });
const FileQuery = z.object({ path: z.string().min(1).max(MAX_PATH_CHARS) });
const AttachmentsQuery = z.object({ repo_id: z.string().uuid() });

/**
 * project-context module (SPEC-01).
 *   GET  /repos/:id/context[?refresh=true]   → Markdown documents of the default branch
 *   GET  /repos/:id/context/file?path=       → effective text of one listed document
 *   PUT  /repos/:id/context/file             → save the local override of a document
 *   DELETE /repos/:id/context/file?path=     → remove the override (repository version back)
 *   GET|PUT /agents/:id/context              → documents an agent attaches (per repo)
 *   GET|PUT /skills/:id/context              → documents a skill attaches (per repo)
 */
export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.projectContext;

  // A forced refresh re-reads every blob: cap it. The limiter is absent in tests.
  const refreshLimit =
    typeof appBase.rateLimit === 'function'
      ? appBase.rateLimit({ max: 10, timeWindow: '1 minute' })
      : undefined;

  app.get(
    '/repos/:id/context',
    {
      schema: { params: IdParams, querystring: ListQuery, response: { 200: z.array(SpecFile) } },
      preHandler: async (req, reply) => {
        if (req.query.refresh === 'true' && refreshLimit) {
          await (refreshLimit as unknown as (r: typeof req, p: typeof reply) => Promise<void>)(req, reply);
        }
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.list(workspaceId, req.params.id, { refresh: req.query.refresh === 'true' });
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: ContextFileContent } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.readFile(workspaceId, req.params.id, req.query.path);
    },
  );

  app.put(
    '/repos/:id/context/file',
    {
      bodyLimit: OVERRIDE_BODY_LIMIT,
      schema: { params: IdParams, body: ContextFileUpdate, response: { 200: ContextFileContent } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.saveFile(workspaceId, req.params.id, req.body.path, req.body.text);
    },
  );

  app.delete(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery, response: { 200: ContextFileContent } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.resetFile(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get(
    '/agents/:id/context',
    {
      schema: {
        params: IdParams,
        querystring: AttachmentsQuery,
        response: { 200: z.array(ContextAttachment) },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getAgentContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/context',
    {
      schema: {
        params: IdParams,
        body: ContextAttachmentsUpdate,
        response: { 200: z.array(ContextAttachment) },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setAgentContext(workspaceId, req.params.id, req.body.repo_id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    {
      schema: {
        params: IdParams,
        querystring: AttachmentsQuery,
        response: { 200: z.array(ContextAttachment) },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSkillContext(workspaceId, req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/skills/:id/context',
    {
      schema: {
        params: IdParams,
        body: ContextAttachmentsUpdate,
        response: { 200: z.array(ContextAttachment) },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setSkillContext(workspaceId, req.params.id, req.body.repo_id, req.body.paths);
    },
  );
}
