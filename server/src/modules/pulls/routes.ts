import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrMeta, PrDetail, PrReviewComment } from '@devdigest/shared';
import { PrCommentInput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams, RepoPrNumberParams } from '../_shared/schemas.js';
import { PullsService } from './service.js';
import { PullsRepository } from './repository.js';

/**
 * F1 — pulls module. Transport layer only: validates requests and delegates
 * to PullsService (GitHub sync, detail refresh, comments).
 *   GET  /repos/:id/pulls          → list PRs for a repo (open + recently merged/closed,
 *                                    synced from GitHub, persisted). `status` is the
 *                                    derived review status.
 *   GET  /repos/:id/pulls/:number  → full PR detail addressed by PR number
 *   GET  /pulls/:id                → full PR detail (diff/files, commits, body)
 *   GET  /pulls/:id/comments       → inline review comments (live from GitHub)
 *   POST /pulls/:id/comments       → create an inline review comment on GitHub
 *
 * Import is idempotent (unique repo_id+number). Review trigger is MANUAL
 * and owned by A2 — this module only imports/reads.
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Module-local composition root: the service only sees narrow ports.
  const service = new PullsService({
    pulls: new PullsRepository(container.db),
    github: () => container.github(),
    log: app.log,
  });

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req): Promise<PrMeta[]> => {
    const { workspaceId } = await getContext(container, req);
    return service.listForRepo(workspaceId, req.params.id);
  });

  app.get(
    '/repos/:id/pulls/:number',
    { schema: { params: RepoPrNumberParams } },
    async (req): Promise<PrDetail> => {
      const { workspaceId } = await getContext(container, req);
      return service.getDetailByNumber(workspaceId, req.params.id, req.params.number);
    },
  );

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req): Promise<PrDetail> => {
    const { workspaceId } = await getContext(container, req);
    return service.getDetail(workspaceId, req.params.id);
  });

  // ---- Inline review comments (Files changed tab) -------------------------
  // Proxied live to GitHub (no local persistence): GET reflects existing PR
  // comments; POST creates one immediately.
  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams } },
    async (req): Promise<PrReviewComment[]> => {
      const { workspaceId } = await getContext(container, req);
      return service.listComments(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req): Promise<PrReviewComment> => {
      const { workspaceId } = await getContext(container, req);
      return service.createComment(workspaceId, req.params.id, req.body);
    },
  );
}
