/**
 * repo-intel HTTP module.
 *
 *   GET  /repos/:id/index-state  → IndexState (always works; degraded on missing data)
 *   POST /repos/:id/resync       → enqueues a RESYNC_JOB_KIND job (202 + job id):
 *                                  fetch latest from origin + incremental reindex.
 *
 * The INDEX/REFRESH/RESYNC job handlers are declared in ./composition.ts and
 * registered on the JobRunner at boot by the Container (not by this plugin).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { RepoIndexState } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/** The facade returns `updatedAt` as a Date; JSON serialises it to the contract's ISO string. */
const IndexStateResponse = RepoIndexState.extend({ updatedAt: z.union([z.date(), z.string()]) });

const ResyncResponse = z.union([
  z.object({ status: z.literal('accepted'), jobId: z.string() }),
  z.object({ status: z.literal('accepted'), degraded: z.literal(true), reason: z.literal('no_handler') }),
]);

export default async function repoIntelRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/repos/:id/index-state',
    { schema: { params: IdParams, response: { 200: IndexStateResponse } } },
    async (req) => {
      // Resolve tenancy so the request is workspace-scoped even though the
      // facade itself is tenant-agnostic. `container.repoIntel` honours the
      // test override of the read facade.
      await getContext(container, req);
      return container.repoIntel.getIndexState(req.params.id);
    },
  );

  app.post(
    '/repos/:id/resync',
    { schema: { params: IdParams, response: { 202: ResyncResponse } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      // 202 even when enqueue fails so the UI can still poll /index-state;
      // the outcome shows up in `repo_index_state` once the worker runs.
      const result = await container.modules.repoIntel.service.requestResync(workspaceId, req.params.id);
      reply.code(202);
      return result;
    },
  );
}
