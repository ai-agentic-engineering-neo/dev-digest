import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Repo, RepoInput, RepoRefreshResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { RepoService } from './service.js';

/**
 * F1 — repos module. Transport layer only: parses requests, maps status
 * codes, and delegates all business logic to RepoService.
 *   POST   /repos              → add repo (parse URL, persist, enqueue real clone)
 *   GET    /repos              → list repos (workspace-scoped)
 *   POST   /repos/:id/refresh  → re-fetch clone + bump last_polled_at
 *   DELETE /repos/:id          → remove repo
 *
 * The clone runs as a JobRunner job (kind 'clone') — real `git clone` via the
 * GitClient adapter into <cloneDir>/<owner>/<repo>.
 */
const DeleteRepoResponse = z.object({ removedId: z.string() });

export default async function reposRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  // Composition: the service gets exactly the ports it uses. The repository
  // comes from the container because the workspace module reads it too.
  const service = new RepoService({
    repos: app.container.repoStore,
    git: app.container.git,
    jobs: app.container.jobs,
    log: app.log,
  });

  // Register the clone job handler once.
  service.registerCloneJobHandler();

  app.post('/repos', { schema: { body: RepoInput, response: { 200: Repo, 201: Repo } } }, async (req, reply) => {
    const { workspaceId, userId } = await getContext(app.container, req);
    const { repo, created } = await service.add(workspaceId, userId, req.body.url);
    reply.status(created ? 201 : 200);
    return repo;
  });

  app.get('/repos', { schema: { response: { 200: z.array(Repo) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.post(
    '/repos/:id/refresh',
    { schema: { params: IdParams, response: { 200: RepoRefreshResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.refresh(workspaceId, req.params.id);
    },
  );

  app.delete(
    '/repos/:id',
    { schema: { params: IdParams, response: { 200: DeleteRepoResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      await service.remove(workspaceId, req.params.id);
      return { removedId: req.params.id };
    },
  );
}
