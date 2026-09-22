import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PrCommentInput, PrDetail, PrMeta, PrReviewComment } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * F1 — pulls module (http). Use cases live in PullsService.
 *   GET  /repos/:id/pulls    → PRs of a repo (synced from GitHub, persisted) + rollups
 *   GET  /pulls/:id          → full PR detail (files, commits, body, linked issue)
 *   GET  /pulls/:id/comments → inline review comments (proxied live to GitHub)
 *   POST /pulls/:id/comments → create an inline review comment on GitHub
 */
export default async function pullsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const pulls = () => container.modules.pulls.service;

  app.get(
    '/repos/:id/pulls',
    { schema: { params: IdParams, response: { 200: z.array(PrMeta) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return pulls().listForRepo(workspaceId, req.params.id, req.log);
    },
  );

  app.get('/pulls/:id', { schema: { params: IdParams, response: { 200: PrDetail } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return pulls().getDetail(workspaceId, req.params.id, req.log);
  });

  app.get(
    '/pulls/:id/comments',
    { schema: { params: IdParams, response: { 200: z.array(PrReviewComment) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return pulls().listComments(workspaceId, req.params.id, req.log);
    },
  );

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput, response: { 200: PrReviewComment } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return pulls().createComment(workspaceId, req.params.id, req.body);
    },
  );
}
