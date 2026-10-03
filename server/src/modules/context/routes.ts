import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContextPathsInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ContextService } from './service.js';

const FileQuery = z.object({ path: z.string().min(1) });

/**
 * Project Context module. Read-only over the repo clone; no route writes
 * document content.
 *   GET /repos/:id/context              → discovered documents (roots, glob, tokens, usage)
 *   GET /repos/:id/context/file?path=   → one document with its markdown
 *   GET /agents/:id/context             → own (ordered) + skill-inherited paths
 *   PUT /agents/:id/context             → replace the agent's ordered paths (bumps version)
 *   GET /skills/:id/context             → the skill's ordered paths
 *   PUT /skills/:id/context             → replace the skill's ordered paths (bumps version)
 */
export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ContextService(app.container);

  app.get('/repos/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: FileQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.get(workspaceId, req.params.id, req.query.path);
    },
  );

  app.get('/agents/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ctx = await service.agentContext(workspaceId, req.params.id);
    if (!ctx) throw new NotFoundError('Agent not found');
    return ctx;
  });

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: ContextPathsInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ctx = await service.setAgentContext(workspaceId, req.params.id, req.body.paths);
      if (!ctx) throw new NotFoundError('Agent not found');
      return ctx;
    },
  );

  app.get('/skills/:id/context', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ctx = await service.skillContext(workspaceId, req.params.id);
    if (!ctx) throw new NotFoundError('Skill not found');
    return ctx;
  });

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: ContextPathsInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ctx = await service.setSkillContext(workspaceId, req.params.id, req.body.paths);
      if (!ctx) throw new NotFoundError('Skill not found');
      return ctx;
    },
  );
}
