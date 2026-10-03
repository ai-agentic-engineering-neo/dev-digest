import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { WorkspaceRepository } from './repository.js';

/**
 * F1 — workspace manager: where clones live + a summary of cloned repos.
 *   GET /workspace        → workspace info + cloneDir + cloned repos summary
 *
 * A single pass-through read with no business logic — per onion-architecture's
 * "routes-only genuinely is fine" carve-out, this calls the repository
 * directly rather than adding an empty service.ts.
 *
 * Cleanup/re-pull of individual repos is handled by the repos module
 * (refresh/delete); this surface gives the UI an overview.
 */
export default async function workspaceRoutes(app: FastifyInstance) {
  const { container } = app;
  const { db } = container;
  const repo = new WorkspaceRepository(db);

  app.get('/workspace', async (req) => {
    const { workspaceId } = await getContext(container, req);
    const repos = await repo.listRepos(workspaceId);
    return {
      workspaceId,
      cloneDir: container.config.cloneDir,
      repos: repos.map((r) => ({
        id: r.id,
        full_name: r.fullName,
        clone_path: r.clonePath,
        last_polled_at: r.lastPolledAt?.toISOString() ?? null,
        cloned: Boolean(r.clonePath),
      })),
    };
  });
}
