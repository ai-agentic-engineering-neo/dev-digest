import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrCommentInput } from '@devdigest/shared';
import type { RequestContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import type { PullsService } from '../application/pulls.service.js';
import { presentPullListItem } from './presenter.js';

export interface PullsRouteDeps {
  service: PullsService;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

/**
 * F1 — pull requests.
 *   GET  /repos/:id/pulls    → PR list (synced from GitHub when possible, persisted)
 *   GET  /pulls/:id          → full PR detail (files, commits, body)
 *   GET  /pulls/:id/comments → inline review comments, live from GitHub
 *   POST /pulls/:id/comments → post one inline comment to GitHub
 */
export async function registerPullsRoutes(
  appBase: FastifyInstance,
  { service, context }: PullsRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get('/repos/:id/pulls', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return (await service.listForRepo(workspaceId, req.params.id)).map(presentPullListItem);
  });

  app.get('/pulls/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return service.detail(workspaceId, req.params.id);
  });

  app.get('/pulls/:id/comments', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await context(req);
    return service.listComments(workspaceId, req.params.id);
  });

  app.post(
    '/pulls/:id/comments',
    { schema: { params: IdParams, body: PrCommentInput } },
    async (req) => {
      const { workspaceId } = await context(req);
      const { path, line, side, body, in_reply_to } = req.body;
      return service.createComment(workspaceId, req.params.id, {
        path,
        line,
        body,
        ...(side ? { side } : {}),
        ...(in_reply_to != null ? { inReplyTo: in_reply_to } : {}),
      });
    },
  );
}
