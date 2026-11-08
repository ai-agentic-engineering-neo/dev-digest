import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastRadiusResponse, PriorPullsResponseSchema } from './schemas.js';
import { BlastService } from './service.js';

/**
 * Blast module — what a PR's changed symbols reach, from the repo-intel index.
 *   GET /pulls/:id/blast         → symbols, direct callers, endpoints/crons (no LLM, no GitHub)
 *   GET /pulls/:id/prior-pulls   → earlier PRs of the same repo touching this PR's files
 * The service 404s for a PR outside the caller's workspace; a missing/partial index is
 * reported as `degraded`, never as a 5xx.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new BlastService(app.container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.forPull(workspaceId, req.params.id);
    },
  );

  app.get(
    '/pulls/:id/prior-pulls',
    { schema: { params: IdParams, response: { 200: PriorPullsResponseSchema } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.priorPulls(workspaceId, req.params.id);
    },
  );
}
