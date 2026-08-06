import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * blast module — specs/07-blast-radius.md.
 *   GET /pulls/:id/blast → changed symbols → their resolved cross-file
 *   callers → impacted HTTP endpoints/crons, read entirely off repo-intel's
 *   persistent index (no LLM call, no clone parsing on the happy path).
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Composition point: the route ring is the only ring allowed to know
  // concrete classes. BlastService declares its own narrow `PrFileLookup`
  // port (mirrors reviews/service.ts's `AgentLookup`) — `container.reviewRepo`
  // satisfies it structurally without blast/service.ts importing the reviews
  // module. `container.repoIntel` is the cross-module-safe facade already.
  const service = new BlastService(container.reviewRepo, container.repoIntel);

  app.get('/pulls/:id/blast', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.getBlast(workspaceId, req.params.id);
  });
}
