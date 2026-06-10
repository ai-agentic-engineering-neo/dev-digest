/**
 * repo-intel HTTP module — T1 surface.
 *
 *   GET  /repos/:id/index-state  → IndexState (always works, may be degraded)
 *   POST /repos/:id/reindex      → 202 no-op stub
 *
 * Mirrors the blast module: pulls `RepoIntel` off the container (via the
 * `repoIntel` getter wired in platform/container.ts) so tests can override it.
 *
 * T2 will replace the POST stub with an `INDEX_JOB_KIND` enqueue against
 * `container.jobs`.
 */
import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import type { IndexState } from './types.js';

export default async function repoIntelRoutes(app: FastifyInstance) {
  const { container } = app;

  app.get<{ Params: { id: string } }>(
    '/repos/:id/index-state',
    async (req): Promise<IndexState> => {
      // Resolve tenancy so the request is workspace-scoped even though the
      // facade itself is tenant-agnostic (consistent with blast routes).
      await getContext(container, req);
      return container.repoIntel.getIndexState(req.params.id);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/repos/:id/reindex',
    async (req, reply) => {
      await getContext(container, req);
      // TODO(T2): container.jobs.enqueue(workspaceId, INDEX_JOB_KIND, { repoId })
      // and return the job id. T1 is a no-op acknowledgement so the UI can
      // wire the button now and start polling /index-state.
      reply.code(202);
      return { status: 'accepted', degraded: true, reason: 't1-skeleton' };
    },
  );
}
