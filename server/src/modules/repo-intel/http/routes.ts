/**
 * repo-intel HTTP routes.
 *
 *   GET  /repos/:id/index-state  → IndexState (always works; degraded on missing data)
 *   POST /repos/:id/resync       → enqueues a RESYNC_JOB_KIND job (202 + job id):
 *                                  fetch latest from origin + incremental reindex.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { RequestContext } from '../../_shared/context.js';
import type { JobScheduler } from '../../_shared/domain/jobs.js';
import { RESYNC_JOB_KIND } from '../../_shared/job-kinds.js';
import { IdParams } from '../../_shared/schemas.js';
import type { RepoIntel } from '../types.js';

export interface RepoIntelRouteDeps {
  repoIntel: Pick<RepoIntel, 'getIndexState'>;
  jobs: Pick<JobScheduler, 'enqueue'>;
  context: (req: FastifyRequest) => Promise<RequestContext>;
}

export async function registerRepoIntelRoutes(
  appBase: FastifyInstance,
  { repoIntel, jobs, context }: RepoIntelRouteDeps,
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();

  app.get('/repos/:id/index-state', { schema: { params: IdParams } }, async (req) => {
    // Resolve tenancy so the request is workspace-scoped even though the
    // facade itself is tenant-agnostic.
    await context(req);
    return repoIntel.getIndexState(req.params.id);
  });

  app.post('/repos/:id/resync', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await context(req);
    // 202 even when enqueue fails (no handler / DB hiccup) so the UI can keep
    // polling /index-state; the outcome lands in `repo_index_state`.
    let jobId: string | null = null;
    try {
      jobId = (await jobs.enqueue(workspaceId, RESYNC_JOB_KIND, { repoId: req.params.id })).id;
    } catch {
      // degraded path
    }
    reply.code(202);
    return jobId
      ? { status: 'accepted', jobId }
      : { status: 'accepted', degraded: true, reason: 'no_handler' };
  });
}
