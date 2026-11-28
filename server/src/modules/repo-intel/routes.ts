/**
 * repo-intel HTTP module.
 *
 *   GET  /repos/:id/index-state  → IndexState (always works; degraded on missing data)
 *   POST /repos/:id/resync       → enqueues a RESYNC_JOB_KIND job (202 + job id):
 *                                  fetch latest from origin + incremental reindex.
 *
 * Job-handler registration lives here: this plugin runs once at app boot and
 * calls `RepoIntelService.registerIndexJobHandlers()` so INDEX/REFRESH jobs
 * enqueued by `repos/service.ts` (after clone / on refresh) have a handler
 * to run against. Mirrors the `RepoService.registerCloneJobHandler()` shape.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { RepoIntelState, ResyncResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

export default async function repoIntelRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  // Register the INDEX/REFRESH/RESYNC handlers exactly once at module load.
  // `repoIntelService` is always the real service (it owns the jobs);
  // `container.repoIntel` is the read facade, which tests may replace.
  const service = container.repoIntelService;
  service.registerIndexJobHandlers();

  app.get(
    '/repos/:id/index-state',
    { schema: { params: IdParams, response: { 200: RepoIntelState } } },
    async (req) => {
      // Resolve tenancy so the request is workspace-scoped even though the
      // facade itself is tenant-agnostic (consistent with blast routes).
      await getContext(container, req);
      const state = await container.repoIntel.getIndexState(req.params.id);
      return { ...state, updatedAt: state.updatedAt.toISOString() };
    },
  );

  app.post(
    '/repos/:id/resync',
    { schema: { params: IdParams, response: { 202: ResyncResponse } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      // 202 even when the job could not be queued, so the UI can still poll
      // /index-state without an inline error path.
      const jobId = await service.requestResync(workspaceId, req.params.id);
      reply.code(202);
      return jobId
        ? { status: 'accepted' as const, jobId }
        : { status: 'accepted' as const, degraded: true, reason: 'no_handler' };
    },
  );
}
