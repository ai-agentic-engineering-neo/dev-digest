import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrCommentInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PullRepository } from './repository.js';
import { PullsService } from './service.js';

/**
 * F1 — pulls module. Transport only.
 *   GET  /repos/:id/pulls     → list PRs (sync from GitHub when a token exists)
 *   GET  /pulls/:id           → PR detail
 *   GET  /pulls/:id/comments  → inline review comments (live GitHub, empty offline)
 *   POST /pulls/:id/comments  → create one inline comment
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by the reviews module — this module only imports and reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new PullsService({
    store: new PullRepository(container.db),
    github: () => container.github(),
    log: app.log,
  });

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.get('/pulls/:id/comments', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.listComments(workspaceId, req.params.id);
  });

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
