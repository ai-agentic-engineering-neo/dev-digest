import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RepoInput } from '@devdigest/shared';
import type { RequestContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import type { ReposService } from '../application/repos.service.js';
import { presentRepo } from './presenter.js';

export interface ReposRouteDeps {
  service: ReposService;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

/**
 * F1 — repositories.
 *   POST   /repos             → add repo (201 new / 200 existing), clone runs as a job
 *   GET    /repos             → list repos (workspace-scoped)
 *   POST   /repos/:id/refresh → re-clone + incremental reindex
 *   DELETE /repos/:id         → remove repo
 */
export async function registerReposRoutes(
  appBase: FastifyInstance,
  { service, context }: ReposRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.post('/repos', { schema: { body: RepoInput } }, async (req, reply) => {
    const { workspaceId, userId } = await context(req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return presentRepo(repo);
  });

  app.get('/repos', async (req) => {
    const { workspaceId } = await context(req);
    return (await service.list(workspaceId)).map(presentRepo);
  });

  app.post('/repos/:id/refresh', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return service.refresh(workspaceId, req.params.id);
  });

  app.delete('/repos/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    await service.remove(workspaceId, req.params.id);
    return { deleted: req.params.id };
  });
}
