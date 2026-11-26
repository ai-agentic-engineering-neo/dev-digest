import type { FastifyInstance } from 'fastify';
import { getContext } from '../_shared/context.js';
import { WorkspaceRepository } from './repository.js';
import { WorkspaceService } from './service.js';

/**
 * F1 — workspace manager: where clones live + a summary of cloned repos.
 *   GET /workspace        → workspace info + cloneDir + cloned repos summary
 *
 * Cleanup/re-pull of individual repos is handled by the repos module
 * (refresh/delete); this surface gives the UI an overview.
 */
export default async function workspaceRoutes(app: FastifyInstance) {
  const { container } = app;
  // Module composition root.
  const service = new WorkspaceService({
    repos: new WorkspaceRepository(container.db),
    cloneDir: container.config.cloneDir,
  });

  app.get('/workspace', async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.overview(workspaceId);
  });
}
